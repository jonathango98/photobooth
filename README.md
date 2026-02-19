# Photobooth

A simple web-based photobooth application that captures multiple photos, allows template selection, and generates a collage with a QR code for sharing.

## Features

-   Live camera feed on idle screen.
-   Configurable photo capture countdown.
-   Multiple photo shots.
-   Template selection for collages.
-   QR code generation for sharing collages.
-   Backend to save captured raw photos and collages.

## Installation

This project requires Node.js.

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd photobooth
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Usage

1.  **Start the server:**
    ```bash
    node server.js
    ```
    The server will typically start on `http://localhost:3000`. Check your console output for the exact address.

2.  **Open in Browser:**
    Navigate to the server address (e.g., `http://localhost:3000`) in your web browser.

3.  **Take Photos:**
    -   The live camera feed will be displayed on the idle screen.
    -   Click anywhere on the screen to start the photo countdown.
    -   Follow the prompts to take multiple shots.

4.  **Select Template & Share:**
    -   After all shots are captured, you will be directed to a template selection screen.
    -   Choose your preferred collage template.
    -   The generated collage will be displayed along with a QR code. Scan the QR code with your phone to view or download the collage.

## Project Structure

-   `server.js`: The main Node.js Express server that handles static file serving and photo upload API.
-   `public/`: Contains all frontend assets.
    -   `public/index.html`: The main HTML file for the photobooth interface.
    -   `public/main.js`: JavaScript logic for camera control, photo capture, collage generation, and UI interactions.
    -   `public/style.css`: CSS file for styling the application.
    -   `public/config.json`: Configuration file for photobooth settings (e.g., number of shots, countdown timers, template definitions).
    -   `public/templates/`: Directory holding image files used as overlays for collage templates.
-   `photos/`: Directory where the server saves captured images.
    -   `photos/raw/`: Stores individual raw photos taken during a session.
    -   `photos/collage/`: Stores the final generated photo collages.

## Configuration

The `public/config.json` file allows customization of the photobooth behavior, including:

-   `siteName`: The title shown in the browser tab.
-   `capture.totalShots`: Number of photos to take per session.
-   `capture.photoWidth`, `capture.photoHeight`: Dimensions for captured photos.
-   `countdown.seconds`, `countdown.stepMs`: Countdown timer settings.
-   `templates`: An array defining collage templates, including their layout and image overlays.
-   `qr.size`, `qr.margin`: Settings for the generated QR code.

Feel free to modify `public/config.json` to suit your needs.
