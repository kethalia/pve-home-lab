# Cloud Gaming

Sunshine + Steam cloud gaming with NVIDIA GPU passthrough, streamed to clients via Moonlight.

## Dependencies

### Docker

Check [this guide](../docker/README.md) to deploy docker.

### NVIDIA GPU

The host machine needs NVIDIA GPU passthrough configured. The following devices are passed through to the container:

- `/dev/nvidia0`
- `/dev/nvidiactl`
- `/dev/nvidia-uvm`
- `/dev/nvidia-uvm-tools`
- `/dev/nvidia-caps`

## Start

```shell
docker compose up -d
```

## References

- https://github.com/LizardByte/Sunshine
- https://github.com/ClassicOldSong/Apollo/blob/master/DOCKER_README.md
- https://www.siberoloji.com/arch-linux-howtos-gaming-install-steam/
