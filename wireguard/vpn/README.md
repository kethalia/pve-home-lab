# Wireguard VPN

Setup a VPN to access private services hosted your server from any network.
Kudos to [Justin Ludwig](https://www.procustodibus.com/authors/justin-ludwig/) and [Pro Custodibus](https://www.procustodibus.com/) for a great [article](https://www.procustodibus.com/blog/2020/11/wireguard-hub-and-spoke-config/).

## Assumtions

In this guide we assume the Hub and the server are debian systems and the client is a laptop (Macbook) or mobile phone (iPhone) where you access local services.

## Install wireguard

For in-depth installation guides check [official page](https://www.wireguard.com/install/).

For your hub and server run the following command:

```shell
apt update && apt install wireguard -y
```

## Key generation

For in-depth key generation guides check [official page](https://www.wireguard.com/quickstart/#key-generation)

For your hub and server run the following command:

```shell
wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey
```

## Configure wireguard

Depending on what device you're setting up, there are different ways to add the config.

For your hub and server run the following command:

```shell
nano /etc/wireguard/wg0.conf
```

Paste your config and save.

### Start

Enable the wireguard service to run on restart and use `--now` to run the service immidiately.

```shell
systemctl enable --now wg-quick@wg0
```
