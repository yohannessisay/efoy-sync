"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadViaSsh = void 0;
const child_process_1 = require("child_process");
const uploadViaSsh = (config, ui) => {
    const { host, username, privateKey } = config.ssh;
    const sourceDir = `${config.final_folder}/.`;
    const scpCommand = `scp -r -i ${privateKey} "${sourceDir}" ${username}@${host}:"${config.destination_folder}"`;
    return new Promise((resolve, reject) => {
        ui.step('Uploading files via SCP...');
        (0, child_process_1.exec)(scpCommand, (error, stdout, stderr) => {
            if (error) {
                const errorMessage = `SCP failed with error: ${error.message}\nStderr: ${stderr}\nStdout: ${stdout}`;
                ui.error(errorMessage);
                return reject(new Error(errorMessage));
            }
            if (stderr) {
                ui.warn(`SCP stderr (non-fatal): ${stderr}`);
            }
            ui.info(`SCP stdout: ${stdout}`);
            ui.success('File upload completed successfully.');
            resolve();
        });
    });
};
exports.uploadViaSsh = uploadViaSsh;
