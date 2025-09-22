# Use sunshine base image
FROM lizardbyte/sunshine:latest-ubuntu-24.04

# Update and install Steam + dependencies
USER root
RUN sudo add-apt-repository multiverse \
    && apt update \
    && apt install -y steam 
USER lizard

# Start Sunshine (default entrypoint)
ENTRYPOINT ["/usr/bin/sunshine"]