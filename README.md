# efoy-sync

A simple and efficient tool to synchronize your build files to a remote server using either FTP or SSH. `efoy-sync` provides an interactive terminal experience, informative logging, and graceful error handling.

## Features

- **Step-Based Workflows:** Chain local commands, remote SSH commands, and uploads in a single declarative sequence.
- **FTP and SSH Support:** Choose your preferred method for file transfer.
- **Interactive Prompts:** Review an execution plan and confirm before the sync starts.
- **Resumable Deployments:** Automatically tracks completed steps and uploaded files so you can safely resume interrupted runs.
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
  "run": [
    {
      "name": "Build project",
      "order": 1,
      "target": "local",
      "command": "npm run build"
    },
    {
      "name": "Clean remote directory",
      "order": 2,
      "target": "ssh",
      "command": "cd /var/www/html/forlab && rm -rf all_files"
    },
    {
      "type": "upload",
      "name": "Upload build",
      "order": 3,
      "sourceDir": "dist",
      "destinationDir": "/var/www/html/forlab",
      "method": "ssh",
      "preserveMode": true,
      "uploadStrategy": "tar"
    }
  ],
  "sourceDir": "dist",
  "destinationDir": "/var/www/html/forlab",
  "method": "ssh",
  "uploadStrategy": "tar",
  "ssh": {
    "host": "your_server_ip",
    "username": "your_username",
    "privateKey": "~/.ssh/id_rsa",
    "password": "your_ssh_password"
  },
  "ftp": {
    "FTP_USERNAME": "your_ftp_username",
    "FTP_PASSWORD": "your_ftp_password",
    "FTP_ADDRESS": "your_ftp_server"
  }
}
```

### Configuration Options

- `run` (optional): Either a single command string (legacy style) or an array of step objects executed sequentially. If any step defines `order`, steps are sorted by `order` (ties keep their original order). Supported steps:
  - `command`: Runs a shell command locally or over SSH. Fields: `command` (string), optional `target` (`local` or `ssh`, defaults to `local`), `cwd`, `env`, `name`, `order`, `continueOnError`, and per-step `ssh` overrides (`host`, `username`, `privateKey`, `password`).
  - `upload`: Triggers a file upload. Fields: optional `sourceDir`, `destinationDir`, `method` (`ftp` or `ssh`), `name`, `order`, `preserveMode`, `uploadStrategy`, `continueOnError`, and per-step credential overrides (`ssh` or `ftp`). If no upload step is provided, `efoy-sync` appends one automatically using `sourceDir`/`destinationDir` (or legacy `final_folder`/`destination_folder`) and `method`.
- `sourceDir`: The local directory containing the files to be uploaded.
- `destinationDir`: The default remote directory where the files will be uploaded.
- `preserveMode`: When `true` and using SSH uploads, apply local file permissions on the remote after upload.
- `uploadStrategy`: `files` (default) uploads files one-by-one; `tar` streams a single tar archive over SSH and extracts it on the remote.
- `method`: The default transfer method to use. Can be either `ftp` or `ssh`.
- `ssh` (required when any SSH action is used):
  - `host`: The hostname or IP address of the SSH server.
  - `username`: The SSH username.
  - `privateKey`: The path to your SSH private key.
  - `password`: The SSH password (requires `sshpass` to be installed when no private key is provided).
- `ftp` (required when any FTP upload is used):
  - `FTP_USERNAME`: The FTP username.
  - `FTP_PASSWORD`: The FTP password.
  - `FTP_ADDRESS`: The FTP server address.
- Legacy aliases: `final_folder` and `destination_folder` are still supported for backward compatibility.

## Usage

Once you have configured your `efoy-sync.json` file, you can run the sync process from your project's root directory:

```bash
efoy-sync
```

The tool will then:

1.  Parse your configuration and present a numbered execution plan.
2.  Prompt you to confirm the run before any commands execute.
3.  Execute each step in sequence (local commands, remote commands, uploads), persisting progress so interrupted runs can be resumed.
4.  Log all actions and errors to the `efoy-sync-logs` directory.

## Author

Yohannes Sisay <yohannessisay90@gmail.com>

## License

ISC
