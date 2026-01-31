# Custom installations — Format: name|check_command|install_command
# These are processed by the config-manager custom handler.
# Each tool is only installed if the check_command fails (returns non-zero).
#
# Note: Docker, Node.js, Foundry, Zsh/OhMyZsh, GitHub CLI, act, and PNPM
# are installed via dedicated boot scripts in scripts/ for better control.
# Add additional custom tools here as needed.
