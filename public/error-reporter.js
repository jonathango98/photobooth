// error-reporter.js — global browser-error reporting.
//
// Registers window.onerror and unhandledrejection handlers that POST to
// /api/client-log on the server.  Rules:
//   - Best-effort: any failure in this module is silently swallowed.
//   - Never breaks the booth: no throws, no blocking calls.
//   - Client-side throttle: max 5 reports per 60-second window.
//   - Deduplication: identical consecutive messages are dropped.
//   - Starts with the hardcoded fallback URL; call
//     window._updateErrorReporterUrl(url) after config loads.

(function () {
  'use strict';

  var FALLBACK_API = 'https://photobooth-server-production.up.railway.app';
  var serverUrl = FALLBACK_API;

  // Throttle: sliding window of report timestamps
  var THROTTLE_MAX = 5;
  var THROTTLE_WINDOW_MS = 60 * 1000;
  var reportTimestamps = [];

  // Deduplication: last reported message
  var lastReportedMessage = null;

  function canReport(message) {
    try {
      var now = Date.now();
      // Drop expired timestamps
      reportTimestamps = reportTimestamps.filter(function (t) {
        return now - t < THROTTLE_WINDOW_MS;
      });
      if (reportTimestamps.length >= THROTTLE_MAX) return false;
      if (message === lastReportedMessage) return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function recordReport(message) {
    try {
      reportTimestamps.push(Date.now());
      lastReportedMessage = message;
    } catch (_) {
      // ignore
    }
  }

  function send(payload) {
    try {
      var msg = (payload.message || '').slice(0, 500);
      if (!canReport(msg)) return;
      recordReport(msg);

      var body = {
        level: payload.level || 'error',
        message: msg,
      };
      if (payload.stack) body.stack = String(payload.stack).slice(0, 4000);
      body.url = (window.location.href || '').slice(0, 500);
      body.userAgent = (navigator.userAgent || '').slice(0, 500);

      var endpoint = serverUrl + '/api/client-log';
      // Use fetch with keepalive so the POST survives page unloads.
      // Fall back to XMLHttpRequest in environments without fetch.
      if (typeof fetch === 'function') {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(function () {
          // best-effort — ignore network failures
        });
      } else if (typeof XMLHttpRequest !== 'undefined') {
        try {
          var xhr = new XMLHttpRequest();
          xhr.open('POST', endpoint, true);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send(JSON.stringify(body));
        } catch (_) {
          // ignore
        }
      }
    } catch (_) {
      // Never let the reporter itself throw
    }
  }

  // window.onerror — catches runtime errors
  var _prevOnerror = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    try {
      send({
        level: 'error',
        message: String(message || ''),
        stack: error && error.stack ? error.stack : source + ':' + lineno + ':' + colno,
      });
    } catch (_) {
      // ignore
    }
    if (typeof _prevOnerror === 'function') {
      return _prevOnerror.apply(this, arguments);
    }
    return false;
  };

  // unhandledrejection — catches unhandled Promise rejections
  window.addEventListener('unhandledrejection', function (event) {
    try {
      var reason = event && event.reason;
      var message =
        reason instanceof Error
          ? reason.message
          : reason != null
            ? String(reason)
            : 'Unhandled promise rejection';
      var stack = reason instanceof Error && reason.stack ? reason.stack : undefined;
      send({ level: 'error', message: message, stack: stack });
    } catch (_) {
      // ignore
    }
  });

  // Allow pages to update the server URL once config is loaded
  window._updateErrorReporterUrl = function (url) {
    try {
      if (url && typeof url === 'string') serverUrl = url;
    } catch (_) {
      // ignore
    }
  };
})();
