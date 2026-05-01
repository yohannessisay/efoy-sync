export enum DestructiveCommandKind {
    RemoveFilesystemRoot = 'remove-filesystem-root',
    RemoveHomeDirectory = 'remove-home-directory',
    RemoveCurrentDirectory = 'remove-current-directory',
    RemoveWindowsSystemDrive = 'remove-windows-system-drive',
    FormatFilesystem = 'format-filesystem',
    DiskPartitioning = 'disk-partitioning',
    BlockDeviceOverwrite = 'block-device-overwrite',
    RecursiveRootPermissionChange = 'recursive-root-permission-change',
    ForkBomb = 'fork-bomb',
}

interface DestructiveCommandRule {
    kind: DestructiveCommandKind;
    pattern: RegExp;
    reason: string;
}

const shellSeparator = String.raw`(?:^|[;&|]\s*)`;
const optionalPrefix = String.raw`(?:sudo\s+|env\s+(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*)*`;
const rmForceRecursive = String.raw`rm\s+(?:-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*|-[A-Za-z]*f[A-Za-z]*r[A-Za-z]*)\s+`;
const recursiveChange = String.raw`(?:chmod|chown|chgrp)\s+-[A-Za-z]*R[A-Za-z]*\s+\S+\s+`;

const destructiveCommandRules: DestructiveCommandRule[] = [
    {
        kind: DestructiveCommandKind.RemoveFilesystemRoot,
        pattern: new RegExp(`${shellSeparator}${optionalPrefix}${rmForceRecursive}(?:--no-preserve-root\\s+)?(?:"/"|'/'|/)(?:\\s|$|[;&|])`, 'i'),
        reason: 'removes the filesystem root',
    },
    {
        kind: DestructiveCommandKind.RemoveFilesystemRoot,
        pattern: new RegExp(`${shellSeparator}${optionalPrefix}${rmForceRecursive}(?:"/\\*"|'/\\*'|/\\*)(?:\\s|$|[;&|])`, 'i'),
        reason: 'removes everything under the filesystem root',
    },
    {
        kind: DestructiveCommandKind.RemoveHomeDirectory,
        pattern: new RegExp(`${shellSeparator}${optionalPrefix}${rmForceRecursive}(?:"~"|'~'|~|\\$HOME|\\$\\{HOME\\})(?:/\\*)?(?:\\s|$|[;&|])`, 'i'),
        reason: 'removes the user home directory',
    },
    {
        kind: DestructiveCommandKind.RemoveCurrentDirectory,
        pattern: new RegExp(`${shellSeparator}${optionalPrefix}${rmForceRecursive}(?:"\\."|'\\.'|\\.)(?:/\\*)?(?:\\s|$|[;&|])`, 'i'),
        reason: 'removes the current working directory',
    },
    {
        kind: DestructiveCommandKind.RemoveWindowsSystemDrive,
        pattern: new RegExp(`${shellSeparator}${optionalPrefix}${rmForceRecursive}(?:"[A-Z]:[\\\\/]"|'[A-Z]:[\\\\/]'|[A-Z]:[\\\\/])(?:\\*|\\s|$|[;&|])`, 'i'),
        reason: 'removes a Windows drive root',
    },
    {
        kind: DestructiveCommandKind.RemoveWindowsSystemDrive,
        pattern: /(?:^|[;&|]\s*)(?:rmdir|rd|del)\s+(?:\/s\s+)?(?:\/q\s+)?(?:"[A-Z]:[\\\/]"|'[A-Z]:[\\\/]'|[A-Z]:[\\\/])(?:\*|\s|$|[;&|])/i,
        reason: 'removes a Windows drive root',
    },
    {
        kind: DestructiveCommandKind.FormatFilesystem,
        pattern: /(?:^|[;&|]\s*)(?:sudo\s+)?(?:mkfs(?:\.[A-Za-z0-9]+)?|mke2fs|format)\b/i,
        reason: 'formats a filesystem or drive',
    },
    {
        kind: DestructiveCommandKind.DiskPartitioning,
        pattern: /(?:^|[;&|]\s*)(?:sudo\s+)?(?:fdisk|parted|diskpart)\b/i,
        reason: 'modifies disk partitions',
    },
    {
        kind: DestructiveCommandKind.BlockDeviceOverwrite,
        pattern: /(?:^|[;&|]\s*)(?:sudo\s+)?dd\s+.*\bof=(?:\/dev\/(?:sd|hd|vd|nvme|disk)|[A-Z]:)/i,
        reason: 'overwrites a block device',
    },
    {
        kind: DestructiveCommandKind.RecursiveRootPermissionChange,
        pattern: new RegExp(`${shellSeparator}${optionalPrefix}${recursiveChange}(?:"/"|'/'|/)(?:\\s|$|[;&|])`, 'i'),
        reason: 'recursively changes permissions or ownership on the filesystem root',
    },
    {
        kind: DestructiveCommandKind.ForkBomb,
        pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
        reason: 'starts a shell fork bomb',
    },
];

export const findBlockedCommand = (command: string): DestructiveCommandRule | undefined => {
    const normalized = command.replace(/\s+/g, ' ').trim();
    return destructiveCommandRules.find(rule => rule.pattern.test(normalized));
};

export const assertSafeCommand = (command: string): void => {
    const blocked = findBlockedCommand(command);
    if (!blocked) {
        return;
    }
    throw new Error(`Blocked destructive command (${blocked.kind}): ${blocked.reason}.`);
};
