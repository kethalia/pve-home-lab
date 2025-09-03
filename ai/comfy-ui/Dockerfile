from debian:12

RUN apt-get update \
    && apt-get upgrade --yes --no-install-recommends --no-install-suggests \
    && apt-get install --yes --no-install-recommends --no-install-suggests \
        git \
        python3 \
        python3-pip \
        python3-venv \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 8188

RUN git clone https://github.com/comfyanonymous/ComfyUI.git

WORKDIR /ComfyUI

COPY start.sh start.sh
RUN chmod +x start.sh

RUN python3 -m venv comfy-ui
RUN . ./comfy-ui/bin/activate \
        && pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu129 \
        && pip install -r requirements.txt

CMD ["bash", "start.sh"]
