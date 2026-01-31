# Configuration Files

This directory holds managed configuration files using the **file triplet** convention.

## File Triplet Convention

For each managed file `<name>`, create three files:

| File | Purpose | Example |
|------|---------|---------|
| `<name>` | The actual configuration file | `.bashrc` |
| `<name>.path` | Single line: target directory | `/home/coder` |
| `<name>.policy` | Single line: deployment policy | `default` |

## Policies

| Policy | Target exists? | Action |
|--------|---------------|--------|
| `replace` | Yes | Overwrite target |
| `replace` | No | Copy to target |
| `default` | Yes | **Skip** (preserve user changes) |
| `default` | No | Copy to target |
| `backup` | Yes | Move existing to `<name>.backup-YYYYMMDD-HHMMSS`, then copy |
| `backup` | No | Copy to target |

## Example

```
files/
├── settings.json          # VS Code settings
├── settings.json.path     # Contains: /home/coder/.config/Code/User
├── settings.json.policy   # Contains: default
├── .bashrc                # Shell configuration
├── .bashrc.path           # Contains: /home/coder
└── .bashrc.policy         # Contains: backup
```

## Notes

- If `.policy` is missing, the `default` policy is used
- If `.path` is missing, the file is skipped with an error
- Files are only written when the SHA-256 checksum differs from the target
- File ownership is set to match the target directory's owner
