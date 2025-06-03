# Dokploy

Dokploy is a stable, easy-to-use deployment solution designed to simplify the application management process. Think of Dokploy as your free self hostable alternative to platforms like Heroku, Vercel, and Netlify, leveraging the robustness of Docker and the flexibility of Traefik.

## Dependencies

### Docker

Dokploy uses docker to deploy services. The dokploy app is a docker container with postrgres, redis and traefik as docker containers.
Check [this guide](../docker/README.md) to deploy docker.

## Install Dokploy

Quick setup.

```shell
curl -sSL https://dokploy.com/install.sh | sh
```

For more information check [this documentation page](https://docs.dokploy.com/docs/core/installation).

### Proxmox CT

There are some issues with the above setup in a LXC container, therefore we will setup a manual installation.

```shell
mkdir /app 
```

Copy the `docker-compose.yaml` and `install.sh` to the `/app` directory.

```shell
nano /app/docker-compose.yaml
```

```shell
nano /app/install.sh
```

#### Start

```shell
(cd /app/ ; sh install.sh)
```
 