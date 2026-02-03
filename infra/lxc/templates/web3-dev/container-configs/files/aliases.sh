#!/usr/bin/env bash
# Shell aliases for Web3 development container
# This file is managed by config-manager

# ============================================================================
# Docker shortcuts
# ============================================================================

alias d='docker'
alias dc='docker compose'
alias dps='docker ps'
alias dpsa='docker ps -a'
alias di='docker images'
alias dex='docker exec -it'
alias dlogs='docker logs -f'
alias dstop='docker stop $(docker ps -q)'
alias dclean='docker system prune -af'

# ============================================================================
# Git aliases
# ============================================================================

alias g='git'
alias gs='git status'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gpl='git pull'
alias gco='git checkout'
alias gb='git branch'
alias gd='git diff'
alias gl='git log --oneline --graph --decorate'
alias gll='git log --graph --pretty=format:"%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset" --abbrev-commit'

# ============================================================================
# npm/pnpm shortcuts
# ============================================================================

alias ni='npm install'
alias nid='npm install --save-dev'
alias nr='npm run'
alias nrs='npm run start'
alias nrd='npm run dev'
alias nrb='npm run build'
alias nrt='npm run test'

alias pi='pnpm install'
alias pid='pnpm install --save-dev'
alias pr='pnpm run'
alias prs='pnpm run start'
alias prd='pnpm run dev'
alias prb='pnpm run build'
alias prt='pnpm run test'

# ============================================================================
# Foundry shortcuts
# ============================================================================

alias fb='forge build'
alias ft='forge test'
alias fc='forge clean'
alias fi='forge install'
alias fu='forge update'

# ============================================================================
# System utilities
# ============================================================================

alias h='history'
alias c='clear'
alias e='exit'
alias ports='netstat -tulanp'
alias myip='curl -s ifconfig.me'

# Colored cat (if bat is installed)
if command -v bat >/dev/null 2>&1; then
    alias cat='bat --paging=never'
fi

# Better du (if ncdu is installed)
if command -v ncdu >/dev/null 2>&1; then
    alias du='ncdu --color dark'
fi

# ============================================================================
# Development shortcuts
# ============================================================================

# Quick directory navigation
alias proj='cd ~/projects'
alias repos='cd ~/repos'

# Quick edit config files
alias editbash='vim ~/.bashrc'
alias editalias='vim ~/.config/aliases.sh'
alias editgit='vim ~/.gitconfig'

# Reload shell configuration
alias reload='source ~/.bashrc'

# ============================================================================
# Container-specific utilities
# ============================================================================

# Config manager shortcuts
alias sync='sudo systemctl restart config-manager'
alias synclog='journalctl -u config-manager -f'
alias rollback='config-rollback'

# View service logs
alias vscode-logs='journalctl -u code-server@coder -f'
alias docker-logs='journalctl -u docker -f'
