# How to create a tunnel between a public proxy and a private server?

## NPM (Nginx Proxy Manager)

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

Go to the directory where you have created and saved the `docker-compose.yaml` file.
Run the docker compose in detached mode using the flag `-d`. To ensure the containers restart automatically, add a `restart: unless-stopped` policy to your compose file.

```shell
cd /app && docker compose up -d
```

## Wireguard

Kudos to [Justin Ludwig](https://www.procustodibus.com/authors/justin-ludwig/) and [Pro Custodibus](https://www.procustodibus.com/) for a great [article](https://www.procustodibus.com/blog/2022/09/wireguard-port-forward-from-internet/).

### Install wireguard on both machines

For in-depth installation guides check [official page](https://www.wireguard.com/install/).

For your hub and server run the following command:

```shell
apt update && apt install wireguard -y
```

### Generate private and public key

For in-depth key generation guides check [official page](https://www.wireguard.com/quickstart/#key-generation)

For your hub and server run the following command:

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

Enable the wireguard service to run on restart and use `--now` to run the service immediately.

```shell
systemctl enable --now wg-quick@wg0
```
