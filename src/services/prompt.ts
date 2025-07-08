
export const confirm = (message: string, defaultValue: boolean = true): Promise<boolean> => {
    return new Promise((resolve) => {
        const question = `${message} ${defaultValue ? '(Y/n)' : '(y/N)'} `;
        process.stdout.write(question);

        const onData = (data: Buffer) => {
            const answer = data.toString().trim().toLowerCase();
            process.stdin.removeListener('data', onData);
            process.stdin.pause(); // Stop listening to stdin

            if (answer === 'y' || answer === 'yes') {
                resolve(true);
            } else if (answer === 'n' || answer === 'no') {
                resolve(false);
            } else {
                resolve(defaultValue);
            }
        };

        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', onData);
    });
};
