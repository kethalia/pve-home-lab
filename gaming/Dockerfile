ARG SUNSHINE_VERSION=latest
ARG SUNSHINE_OS=archlinux
FROM lizardbyte/sunshine:${SUNSHINE_VERSION}-${SUNSHINE_OS}

# install Steam, Wayland, etc.
USER root
# RUN sed -i 's/#\[multilib\]/\[multilib\]/g' /etc/pacman.conf && \
#     sed -i 's/#Include = \/etc\/pacman\.d\/mirrorlist/Include = \/etc\/pacman\.d\/mirrorlist/g' /etc/pacman.conf
RUN echo "[multilib]" >> /etc/pacman.conf &&\
    echo "Include = /etc/pacman.d/mirrorlist" >> /etc/pacman.conf
RUN pacman -Syu --noconfirm
RUN pacman -S --noconfirm nvidia nvidia-utils lib32-nvidia-utils vulkan-icd-loader lib32-vulkan-icd-loader nvidia-settings steam
USER ${UNAME}

ENTRYPOINT steam && sunshine