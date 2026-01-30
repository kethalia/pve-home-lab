# Use sunshine base image
FROM lizardbyte/sunshine:latest-ubuntu-24.04

# Update and install Steam + dependencies
USER root
RUN apt update \
    && apt install -y steam-installer steam-devices 
USER lizard

# Start Sunshine (default entrypoint)
ENTRYPOINT ["/usr/bin/sunshine"]