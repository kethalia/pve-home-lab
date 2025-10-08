terraform {
  required_providers {
    coder = {
      source = "coder/coder"
    }
    docker = {
      source = "kreuzwerker/docker"
    }
  }
}

locals {
  username = data.coder_workspace_owner.me.name
}

variable "docker_socket" {
  default     = ""
  description = "(Optional) Docker socket URI"
  type        = string
}

provider "docker" {
  # Defaulting to null if the variable is an empty string lets us have an optional variable without having to set our own default
  host = var.docker_socket != "" ? var.docker_socket : null
}

data "coder_provisioner" "me" {}
data "coder_workspace" "me" {}
data "coder_workspace_owner" "me" {}

resource "coder_agent" "main" {
  arch           = data.coder_provisioner.me.arch
  os             = "linux"
  startup_script = <<-EOT
    set -e

    # Prepare user home with default files on first start.
    if [ ! -f ~/.init_done ]; then
      cp -rT /etc/skel ~
      touch ~/.init_done
    fi

    # Add any commands that should be executed at workspace startup (e.g install requirements, start a program, etc) here
  EOT

  # These environment variables allow you to make Git commits right away after creating a
  # workspace. Note that they take precedence over configuration defined in ~/.gitconfig!
  # You can remove this block if you'd prefer to configure Git manually or using
  # dotfiles. (see docs/dotfiles.md)
  env = {
    GIT_AUTHOR_NAME     = coalesce(data.coder_workspace_owner.me.full_name, data.coder_workspace_owner.me.name)
    GIT_AUTHOR_EMAIL    = "${data.coder_workspace_owner.me.email}"
    GIT_COMMITTER_NAME  = coalesce(data.coder_workspace_owner.me.full_name, data.coder_workspace_owner.me.name)
    GIT_COMMITTER_EMAIL = "${data.coder_workspace_owner.me.email}"
    
    EXTENSIONS_GALLERY="{\"serviceUrl\":\"https://marketplace.visualstudio.com/_apis/public/gallery\"}"
  }

  # The following metadata blocks are optional. They are used to display
  # information about your workspace in the dashboard. You can remove them
  # if you don't want to display any information.
  # For basic resources, you can use the `coder stat` command.
  # If you need more control, you can write your own script.
  metadata {
    display_name = "CPU Usage"
    key          = "0_cpu_usage"
    script       = "coder stat cpu"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "RAM Usage"
    key          = "1_ram_usage"
    script       = "coder stat mem"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Home Disk"
    key          = "3_home_disk"
    script       = "coder stat disk --path $${HOME}"
    interval     = 60
    timeout      = 1
  }

  metadata {
    display_name = "CPU Usage (Host)"
    key          = "4_cpu_usage_host"
    script       = "coder stat cpu --host"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Memory Usage (Host)"
    key          = "5_mem_usage_host"
    script       = "coder stat mem --host"
    interval     = 10
    timeout      = 1
  }

  metadata {
    display_name = "Load Average (Host)"
    key          = "6_load_host"
    # get load avg scaled by number of cores
    script   = <<EOT
      echo "`cat /proc/loadavg | awk '{ print $1 }'` `nproc`" | awk '{ printf "%0.2f", $1/$2 }'
    EOT
    interval = 60
    timeout  = 1
  }

  metadata {
    display_name = "Swap Usage (Host)"
    key          = "7_swap_host"
    script       = <<EOT
      free -b | awk '/^Swap/ { printf("%.1f/%.1f", $3/1024.0/1024.0/1024.0, $2/1024.0/1024.0/1024.0) }'
    EOT
    interval     = 10
    timeout      = 1
  }
}

data "coder_external_auth" "github" {
  id = "primary-github"
}

# See https://registry.coder.com/modules/code-server
module "code-server" {
  count  = data.coder_workspace.me.start_count
  source = "registry.coder.com/modules/code-server/coder"

  # This ensures that the latest version of the module gets downloaded, you can also pin the module version to prevent breaking changes in production.
  version = ">= 1.0.0"

  agent_id = coder_agent.main.id
  order    = 1

  subdomain = true
  use_cached_extensions = true
  extensions = [
    "binary-ink.dark-modern-oled-theme-set",
    "pkief.material-icon-theme",
    "prisma.prisma",
    "graphql.vscode-graphql",
    "graphql.vscode-graphql-syntax",
    "bradlc.vscode-tailwindcss",
    "tintinweb.vscode-solidity-language",
    "nomicfoundation.hardhat-solidity",
    "esbenp.prettier-vscode",
    "eamodio.gitlens",
    "oderwat.indent-rainbow",
    "gruntfuggly.todo-tree",
    "pflannery.vscode-versionlens",
    "ms-vsliveshare.vsliveshare",
    "hashicorp.terraform",
    "saoudrizwan.claude-dev"
  ]
  settings = {
  "[solidity]": {
    "editor.defaultFormatter": "NomicFoundation.hardhat-solidity"
  },
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.fontFamily": "Fira Code",
  "editor.fontLigatures": true,
  "editor.formatOnSave": true,
  "editor.wordWrap": "on",
  "files.autoSave": "off",
  "git.confirmSync": false,
  "terminal.integrated.scrollback": 10000,
  "workbench.colorTheme": "Dark Modern (OLED Black) [Orange]",
  "workbench.iconTheme": "material-icon-theme",
  "solidity.telemetry": false,
  "solidity.formatter": "forge"
}
}

# See https://registry.coder.com/modules/jetbrains-gateway
# module "jetbrains_gateway" {
#   count  = data.coder_workspace.me.start_count
#   source = "registry.coder.com/modules/jetbrains-gateway/coder"

#   # JetBrains IDEs to make available for the user to select
#   jetbrains_ides = ["IU", "PS", "WS", "PY", "CL", "GO", "RM", "RD", "RR"]
#   default        = "IU"

#   # Default folder to open when starting a JetBrains IDE
#   folder = "/home/coder"

#   # This ensures that the latest version of the module gets downloaded, you can also pin the module version to prevent breaking changes in production.
#   version = ">= 1.0.0"

#   agent_id   = coder_agent.main.id
#   agent_name = "main"
#   order      = 2
# }

# See https://registry.coder.com/modules/coder/cursor
module "cursor" {
  count    = data.coder_workspace.me.start_count
  source   = "registry.coder.com/coder/cursor/coder"
  version  = "1.3.2"
  agent_id = coder_agent.main.id
}

# See https://registry.coder.com/modules/coder/zed
# module "zed" {
#   count    = data.coder_workspace.me.start_count
#   source   = "registry.coder.com/coder/zed/coder"
#   version  = "1.1.0"
#   agent_id = coder_agent.main.id
# }

# See https://registry.coder.com/modules/coder/filebrowser
module "filebrowser" {
  count    = data.coder_workspace.me.start_count
  source   = "registry.coder.com/coder/filebrowser/coder"
  version  = "1.1.2"
  agent_id = coder_agent.main.id
}

# See https://registry.coder.com/modules/coder/github-upload-public-key
module "github-upload-public-key" {
  count    = data.coder_workspace.me.start_count
  source   = "registry.coder.com/coder/github-upload-public-key/coder"
  version  = "1.0.15"
  agent_id = coder_agent.main.id
  external_auth_id = data.coder_external_auth.github.id
}

# See https://registry.coder.com/modules/coder/git-commit-signing
module "git-commit-signing" {
  count    = data.coder_workspace.me.start_count
  source   = "registry.coder.com/coder/git-commit-signing/coder"
  version  = "1.0.11"
  agent_id = coder_agent.main.id
}

# See https://registry.coder.com/modules/coder/git-config
module "git-config" {
  count                 = data.coder_workspace.me.start_count
  source                = "registry.coder.com/coder/git-config/coder"
  version               = "1.0.15"
  agent_id              = coder_agent.main.id
}

# See https://registry.coder.com/modules/thezoker/nodejs
module "nodejs" {
  count    = data.coder_workspace.me.start_count
  source   = "registry.coder.com/thezoker/nodejs/coder"
  version  = "1.0.11"
  agent_id = coder_agent.main.id
  node_versions = [
    "18",
    "20",
    "22",
    "node"
  ]
  default_node_version = "22"
}

resource "coder_script" "pnpm" {
  agent_id     = coder_agent.main.id
  display_name = "PNPM"
  icon         = "https://ipfs.chillwhales.dev/ipfs/QmbTbnm9NPqLFvG9Vpkn8BEpYLsqCa196DAeCHZVgVkjeo"
  script = <<EOT
    #!/bin/bash

    BOLD='\033[0;1m'
    CODE='\033[36;40;1m'
    RESET='\033[0m'

    printf "$${BOLD}Installing PNPM!$${RESET}\n"

    if [ ! -d ~/.local/share/pnpm ]; then
      script="$(curl -sS -o- "https://get.pnpm.io/install.sh" 2>&1)"
      if [ $? -ne 0 ]; then
          echo "Failed to download PNPM installation script: $script"
          exit 1
      fi

      output="$(bash <<< "$script" 2>&1)"
      if [ $? -ne 0 ]; then
          echo "Failed to install PNPM: $output"
          exit 1
      fi
    fi

    printf "🥳 PNPM has been installed\n\n"
  EOT
  run_on_start       = true
  start_blocks_login = true
}

resource "coder_script" "foundry" {
  agent_id     = coder_agent.main.id
  display_name = "Foundry"
  icon         = "https://ipfs.chillwhales.dev/ipfs/Qmf6BhBTpRfmHqAewENN15A95spunZqMXVEnQD9BXgfDbx"
  script = <<EOT
    #!/bin/bash

    BOLD='\033[0;1m'
    CODE='\033[36;40;1m'
    RESET='\033[0m'

    printf "$${BOLD}Installing Foundry!$${RESET}\n"

    if [ ! -d ~/.foundry ]; then
      script="$(curl -sS -o- "https://raw.githubusercontent.com/foundry-rs/foundry/master/foundryup/install" 2>&1)"
      if [ $? -ne 0 ]; then
        echo "Failed to download Foundry installation script: $script"
        exit 1
      fi

      getfoundryup="$(bash <<< "$script" 2>&1)"
      if [ $? -ne 0 ]; then
        echo "Failed to get Foundry installer: $getfoundryup"
        exit 1
      fi

      runfoundryup="$(foundryup)"
      if [ $? -ne 0 ]; then
        echo "Failed to run Foundry installer: $runfoundryup"
        exit 1
      fi
    fi

    printf "🥳 Foundry has been installed\n\n"
  EOT
  run_on_start       = true
  start_blocks_login = true
}

resource "coder_script" "zsh" {
  agent_id     = coder_agent.main.id
  display_name = "Oh My Zsh!"
  icon         = "/icon/terminal.svg"
  script = <<EOT
    #!/bin/bash

    ZSH_CUSTOM='.oh-my-zsh/custom'
    BOLD='\033[0;1m'
    CODE='\033[36;40;1m'
    RESET='\033[0m'

    printf "$${BOLD}Installing Oh My Zsh!$${RESET}\n"

    if [ ! -d ~/.oh-my-zsh ]; then
      script="$(curl -sS -o- "https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh" 2>&1)"
      if [ $? -ne 0 ]; then
        echo "Failed to download Oh My Zsh! installation script: $script"
        exit 1
      fi

      output="$(bash <<< "$script" 2>&1)"
      if [ $? -ne 0 ]; then
        echo "Failed to install Oh My Zsh!: $output"
        exit 1
      fi

      powerlevel10k="$(
        git clone --depth=1 https://github.com/romkatv/powerlevel10k.git $ZSH_CUSTOM/themes/powerlevel10k
      )"
      if [ $? -ne 0 ]; then
        echo "Failed to update Oh My Zsh! theme: $powerlevel10k"
        exit 1
      fi

      zsh_autosuggestions="$(
        git clone https://github.com/zsh-users/zsh-autosuggestions.git $ZSH_CUSTOM/plugins/zsh-autosuggestions
      )"
      if [ $? -ne 0 ]; then
        echo "Failed to install zsh-autosuggestions: $zsh_autosuggestions"
        exit 1
      fi

      zsh_syntax_highlighting="$(
        git clone https://github.com/zsh-users/zsh-syntax-highlighting.git $ZSH_CUSTOM/plugins/zsh-syntax-highlighting
      )"
      if [ $? -ne 0 ]; then
        echo "Failed to install zsh-syntax-highlighting: $zsh_syntax_highlighting"
        exit 1
      fi

      zsh_completions="$(
        git clone https://github.com/zsh-users/zsh-completions.git $ZSH_CUSTOM/plugins/zsh-completions
      )"
      if [ $? -ne 0 ]; then
        echo "Failed to install zsh-completions: $zsh_completions"
        exit 1
      fi

      sed -i 's|^ZSH_THEME.*|ZSH_THEME="powerlevel10k/powerlevel10k"|g' .zshrc
      sed -i "s|^plugins.*|plugins=(git zsh-autosuggestions zsh-syntax-highlighting zsh-completions)|g" .zshrc
    fi

    printf "🥳 Oh My Zsh! installed & customized\n\n"
  EOT
  run_on_start       = true
  start_blocks_login = true
}

resource "docker_volume" "home_volume" {
  name = "coder-${data.coder_workspace.me.id}-home"
  # Protect the volume from being deleted due to changes in attributes.
  lifecycle {
    ignore_changes = all
  }
  # Add labels in Docker to keep track of orphan resources.
  labels {
    label = "coder.owner"
    value = data.coder_workspace_owner.me.name
  }
  labels {
    label = "coder.owner_id"
    value = data.coder_workspace_owner.me.id
  }
  labels {
    label = "coder.workspace_id"
    value = data.coder_workspace.me.id
  }
  # This field becomes outdated if the workspace is renamed but can
  # be useful for debugging or cleaning out dangling volumes.
  labels {
    label = "coder.workspace_name_at_creation"
    value = data.coder_workspace.me.name
  }
}

resource "docker_image" "main" {
  name = "coder-${data.coder_workspace.me.id}"
  build {
    context = "./build"
  }
  triggers = {
    dir_sha1 = sha1(join("", [for f in fileset(path.module, "build/*") : filesha1(f)]))
  }
}

resource "docker_container" "workspace" {
  count = data.coder_workspace.me.start_count
  image = docker_image.main.name
  # Uses lower() to avoid Docker restriction on container names.
  name = "coder-${data.coder_workspace_owner.me.name}-${lower(data.coder_workspace.me.name)}"
  # Hostname makes the shell more user friendly: coder@my-workspace:~$
  hostname = data.coder_workspace.me.name
  # Use the docker gateway if the access URL is 127.0.0.1
  entrypoint = ["sh", "-c", replace(coder_agent.main.init_script, "/localhost|127\\.0\\.0\\.1/", "host.docker.internal")]
  env        = ["CODER_AGENT_TOKEN=${coder_agent.main.token}"]
  host {
    host = "host.docker.internal"
    ip   = "host-gateway"
  }
  volumes {
    container_path = "/home/coder"
    volume_name    = docker_volume.home_volume.name
    read_only      = false
  }

  # Add labels in Docker to keep track of orphan resources.
  labels {
    label = "coder.owner"
    value = data.coder_workspace_owner.me.name
  }
  labels {
    label = "coder.owner_id"
    value = data.coder_workspace_owner.me.id
  }
  labels {
    label = "coder.workspace_id"
    value = data.coder_workspace.me.id
  }
  labels {
    label = "coder.workspace_name"
    value = data.coder_workspace.me.name
  }
}
