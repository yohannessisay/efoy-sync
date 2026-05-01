"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSafeCommand = exports.findBlockedCommand = exports.DestructiveCommandKind = void 0;
var DestructiveCommandKind;
(function (DestructiveCommandKind) {
    DestructiveCommandKind["RemoveFilesystemRoot"] = "remove-filesystem-root";
    DestructiveCommandKind["RemoveHomeDirectory"] = "remove-home-directory";
    DestructiveCommandKind["RemoveCurrentDirectory"] = "remove-current-directory";
    DestructiveCommandKind["RemoveWindowsSystemDrive"] = "remove-windows-system-drive";
    DestructiveCommandKind["FormatFilesystem"] = "format-filesystem";
    DestructiveCommandKind["DiskPartitioning"] = "disk-partitioning";
    DestructiveCommandKind["BlockDeviceOverwrite"] = "block-device-overwrite";
    DestructiveCommandKind["RecursiveRootPermissionChange"] = "recursive-root-permission-change";
    DestructiveCommandKind["ForkBomb"] = "fork-bomb";
})(DestructiveCommandKind || (exports.DestructiveCommandKind = DestructiveCommandKind = {}));
const shellSeparator = String.raw `(?:^|[;&|]\s*)`;
const optionalPrefix = String.raw `(?:sudo\s+|env\s+(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)*)*`;
const rmForceRecursive = String.raw `rm\s+(?:-[A-Za-z]*r[A-Za-z]*f[A-Za-z]*|-[A-Za-z]*f[A-Za-z]*r[A-Za-z]*)\s+`;
const recursiveChange = String.raw `(?:chmod|chown|chgrp)\s+-[A-Za-z]*R[A-Za-z]*\s+\S+\s+`;
const destructiveCommandRules = [
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
const findBlockedCommand = (command) => {
    const normalized = command.replace(/\s+/g, ' ').trim();
    return destructiveCommandRules.find(rule => rule.pattern.test(normalized));
};
exports.findBlockedCommand = findBlockedCommand;
const assertSafeCommand = (command) => {
    const blocked = (0, exports.findBlockedCommand)(command);
    if (!blocked) {
        return;
    }
    throw new Error(`Blocked destructive command (${blocked.kind}): ${blocked.reason}.`);
};
exports.assertSafeCommand = assertSafeCommand;
