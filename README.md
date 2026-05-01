# efoy-sync

A simple and efficient tool to synchronize your build files using FTP, SSH, or local filesystem copy. `efoy-sync` provides an interactive terminal experience, informative logging, and graceful error handling.

## Features

- **Step-Based Workflows:** Chain local commands, remote SSH commands, and uploads in a single declarative sequence.
- **FTP, SSH, and Local Support:** Choose your preferred method for file transfer or local directory copy.
- **Interactive Prompts:** Review an execution plan and confirm before the sync starts.
- **Resumable Deployments:** Automatically tracks completed steps and uploaded files so you can safely resume interrupted runs.
- **Destructive Command Blocking:** Blocks known catastrophic command patterns before local or SSH command steps run.
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
      "command": "rm -rf /var/www/html/your_app/* /var/www/html/your_app/.[!.]* /var/www/html/your_app/..?*"
    },
    {
      "type": "upload",
      "name": "Upload build",
      "order": 3,
      "sourceDir": "dist",
      "destinationDir": "/var/www/html/your_app",
      "method": "ssh",
      "preserveMode": true,
      "uploadStrategy": "tar"
    }
  ],
  "sourceDir": "dist",
  "destinationDir": "/var/www/html/your_app",
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

You can also start from `efoy-sync.sample.json` for SSH/FTP deployments or `efoy-sync.local.sample.json` for local copy deployments, then update the placeholders.

### Configuration Options

- `run` (optional): Either a single command string (legacy style) or an array of step objects executed sequentially. If any step defines `order`, steps are sorted by `order` (ties keep their original order). Supported steps:
  - `command`: Runs a shell command locally or over SSH. Fields: `command` (string), optional `target` (`local` or `ssh`, defaults to `local`), `cwd`, `env`, `name`, `order`, `continueOnError`, and per-step `ssh` overrides (`host`, `username`, `privateKey`, `password`).
  - `upload`: Triggers a file upload or local directory copy. Fields: optional `sourceDir`, `destinationDir`, `method` (`ftp`, `ssh`, or `local`), `name`, `order`, `preserveMode`, `uploadStrategy`, `continueOnError`, and per-step credential overrides (`ssh` or `ftp`). If no upload step is provided, `efoy-sync` appends one automatically using `sourceDir`/`destinationDir` (or legacy `final_folder`/`destination_folder`) and `method`.
- `sourceDir`: The local directory containing the files to be uploaded.
- `destinationDir`: The default destination directory. For `ftp` and `ssh`, this is remote. For `local`, this is a local filesystem path on the machine running `efoy-sync`.
- `preserveMode`: When `true` and using SSH or local uploads, apply local file permissions at the destination after upload/copy.
- `uploadStrategy`: `files` (default) uploads files one-by-one; `tar` streams a single tar archive over SSH and extracts it on the remote. This option is only used by SSH uploads.
- `method`: The default transfer method to use. Can be `ftp`, `ssh`, or `local`.
- `local`: No credentials are required. `efoy-sync` copies the contents of `sourceDir` into `destinationDir` using platform-aware local paths on Windows, macOS, and Linux. Local copy writes files through temporary files and renames them into place so interrupted runs are recoverable.
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

### Local Copy Example

```json
{
  "run": [
    {
      "name": "Build project",
      "order": 1,
      "command": "npm run build"
    },
    {
      "type": "upload",
      "name": "Copy build locally",
      "order": 2,
      "method": "local",
      "sourceDir": "dist",
      "destinationDir": "./deploy-output",
      "preserveMode": true
    }
  ],
  "method": "local",
  "sourceDir": "dist",
  "destinationDir": "./deploy-output"
}
```

### Command Safety

Command steps run through a destructive-command blocker before execution, whether the command target is `local` or `ssh`. The blocker rejects known catastrophic patterns such as removing filesystem roots, removing a user home directory, formatting drives, changing root permissions recursively, overwriting block devices with `dd`, partitioning disks, and shell fork bombs.

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
