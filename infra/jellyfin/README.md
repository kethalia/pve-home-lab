# Jellyfin Stack

Jellyfin media server with Gluetun VPN, qBittorrent, Radarr, Sonarr, Prowlarr, and Bazarr.

Setup inspired by [source](https://github.com/navilg/media-stack/blob/main/README.md) with small changes.

## Services

| Service | Description |
|---|---|
| **Jellyfin** | Media server with NVIDIA GPU-accelerated transcoding |
| **Gluetun** | VPN client container (routes torrent traffic) |
| **qBittorrent** | Torrent client (runs through VPN) |
| **Radarr** | Movie collection manager |
| **Sonarr** | TV series collection manager |
| **Prowlarr** | Indexer manager (runs through VPN) |
| **Bazarr** | Subtitle manager |

## Dependencies

### Docker

Check [this guide](../docker/README.md) to deploy docker.

### NVIDIA GPU (for hardware transcoding)

The docker-compose uses NVIDIA device passthrough for Jellyfin hardware transcoding. The following devices are passed through:

- `/dev/nvidia0`
- `/dev/nvidiactl`
- `/dev/nvidia-uvm`
- `/dev/nvidia-uvm-tools`
- `/dev/nvidia-caps`

### Network

The compose file uses an external Docker network. Create it before starting:

```shell
sudo docker network create --subnet 172.50.0.0/16 jellyfin_network
```

### Environment Variables

Copy `.env.example` to `.env` and configure VPN credentials, static container IPs, and the root directory for media storage.

## Notes

If using Intel/AMD GPU passthrough instead of NVIDIA, the machine that runs the `docker-compose.yaml` should satisfy the following conditions:

- the command `find /dev/dri -perm 777 -type f` should output:

```shell
/dev/dri/renderD128
/dev/dri/card0
```

If the command has an empty output run the following command:

```shell
chmod 777 /dev/dri/*
```

If still empty output, make sure you have set a device passthrough from the host to the vm for the following devices:

- /dev/dri/renderD128
- /dev/dri/card0

## Start

```shell
docker compose up -d
```
