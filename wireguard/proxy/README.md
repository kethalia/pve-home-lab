# How to create a tunnel between a public proxy and a private server?

## NPM (Nginx Proxy Manger)

### Proxmox LXC Helper Script

You can bootstrap an LXC container in proxmox using [this helper script](https://community-scripts.github.io/ProxmoxVE/scripts?id=nginxproxymanager)

Run on the host:
```shell
bash -c "$(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/ct/nginxproxymanager.sh)"
```

Default login credentials:
**Username:** *admin@example.com*
**Password:** *changeme*

### With docker

Run NPM on the private server to orchestrate incoming traffic.

#### Create `docker-compose.yaml`

Creating a docker compose in the directory `/app`, you can change the path according to your needs.

```shell
mkdir /app && nano /app/docker-compose.yaml
```

#### Start

Go to the drectory where you have created and saved the `docker-compose.yaml` file.
Run the docker compose and setup a daemon using the flag `-d`, this configures it to run even if the machine is restarted.

```shell
cd /app && docker compose up -d
```

## Wireguard

### Install wireguard on both machines

```shell
apt update && apt install wireguard -y
```

### Genearte private and public key

```shell
wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey
```

### Configure wireguard

#### Public server

Use `wg0-public-server.conf` as a template for your `wg0.conf`

#### Private server

Use `wg0-private-server.conf` as a template for your `wg0.conf`

#### Create `wg0.conf`

```shell
nano /etc/wireguard/wg0.conf
```

Paste your config and save.

### Start

Enable the wireguard service to run on restart and use `--now` to run the service immidiately.

```shell
systemctl enable --now wg-quick@wg0
```
