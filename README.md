# efoy-sync

A simple and efficient tool to synchronize your build files to a remote server using either FTP or SSH. `efoy-sync` provides an interactive terminal experience, informative logging, and graceful error handling.

## Features

- **FTP and SSH Support:** Choose your preferred method for file transfer.
- **Interactive Prompts:** Confirm actions before proceeding to prevent accidental deployments.
- **Build Command Integration:** Automatically run your project's build command before syncing.
- **Detailed Logging:** All actions are logged to a local `efoy-sync-logs` directory for easy debugging.
- **Minimal Dependencies:** Designed to be lightweight and fast.

## Installation

```bash
npm install -g efoy-sync
```

## Configuration

Create an `efoy-sync.json` file in the root of your project with the following structure:

```json
{
  "run": "npm run build",
  "final_folder": "dist",
  "destination_folder": "/var/www/html",
  "method": "ssh",
  "ssh": {
    "host": "your_server_ip",
    "username": "your_username",
    "privateKey": "~/.ssh/id_rsa"
  },
  "ftp": {
    "FTP_USERNAME": "your_ftp_username",
    "FTP_PASSWORD": "your_ftp_password",
    "FTP_ADDRESS": "your_ftp_server"
  }
}
```

### Configuration Options

- `run` (optional): The command to execute before syncing files (e.g., `npm run build`, `yarn build`).
- `final_folder`: The local directory containing the files to be uploaded.
- `destination_folder`: The remote directory where the files will be uploaded.
- `method`: The transfer method to use. Can be either `ftp` or `ssh`.
- `ssh` (required if `method` is `ssh`):
  - `host`: The hostname or IP address of the SSH server.
  - `username`: The SSH username.
  - `privateKey`: The path to your SSH private key.
- `ftp` (required if `method` is `ftp`):
  - `FTP_USERNAME`: The FTP username.
  - `FTP_PASSWORD`: The FTP password.
  - `FTP_ADDRESS`: The FTP server address.

## Usage

Once you have configured your `efoy-sync.json` file, you can run the sync process from your project's root directory:

```bash
efoy-sync
```

The tool will then:

1.  Execute the specified `run` command.
2.  Prompt you to confirm the sync operation.
3.  Transfer the files from your `final_folder` to the `destination_folder` on the remote server using the specified method.
4.  Log all actions and errors to the `efoy-sync-logs` directory.

## Author

Yohannes Sisay <yohannessisay90@gmail.com>

## License

ISC
