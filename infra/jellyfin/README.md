# Jellyfin Stack

Setup inpired from [source](https://github.com/navilg/media-stack/blob/main/README.md) with small changes.

## Notes

The machine that runs the `docker-compose.yaml` should satisfy the following conditions:

- the command `find /dev/dri -perm 777 -type f` should output:

```shell
/dev/dri/renderD128
/dev/dri/card0
```

If the command has an empyt output run the following command:

```shell
chmod 777 /dev/dri/*
```

If still empty output, make sure you have set a device passthrough from the host to the vm for the following devices:

- /dev/dri/renderD128
- /dev/dri/card0
