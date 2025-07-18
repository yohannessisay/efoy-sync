"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirm = void 0;
const confirm = (message, defaultValue = true) => {
    return new Promise((resolve) => {
        const question = `${message} ${defaultValue ? '(Y/n)' : '(y/N)'} `;
        process.stdout.write(question);
        const onData = (data) => {
            const answer = data.toString().trim().toLowerCase();
            process.stdin.removeListener('data', onData);
            process.stdin.pause(); // Stop listening to stdin
            if (answer === 'y' || answer === 'yes') {
                resolve(true);
            }
            else if (answer === 'n' || answer === 'no') {
                resolve(false);
            }
            else {
                resolve(defaultValue);
            }
        };
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', onData);
    });
};
exports.confirm = confirm;
