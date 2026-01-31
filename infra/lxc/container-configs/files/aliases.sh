# =============================================================================
# aliases.sh — Shell aliases (policy: replace — always kept in sync)
# =============================================================================

# Docker
alias d="docker"
alias dc="docker-compose"
alias dps="docker ps"
alias dlog="docker logs -f"

# Git
alias g="git"
alias gs="git status"
alias gp="git pull"
alias gc="git commit"
alias gco="git checkout"
alias gb="git branch"
alias gd="git diff"
alias gl="git log --oneline -20"
alias glog="git log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit"

# General
alias ll="ls -lah"
alias la="ls -la"
alias ..="cd .."
alias ...="cd ../.."
alias grep="grep --color=auto"

# Development
alias nr="npm run"
alias pn="pnpm"
alias pnd="pnpm dev"
alias pnb="pnpm build"
alias pnt="pnpm test"
