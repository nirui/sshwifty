# Build the build base environment
FROM debian:testing AS base
RUN set -ex && \
    cd / && \
    echo 'res=0; for i in $(seq 0 36); do $@; res=$?; [ $res -eq 0 ] && exit $res || sleep 10; done; exit $res' > /try.sh && chmod +x /try.sh && \
    echo 'cpid=""; ret=0; i=0; for c in "$@"; do ( (((((eval $c; echo $? >&3) | sed "s/^/|-($i) /" >&4) 2>&1 | sed "s/^/|-($i)!/" >&2) 3>&1) | (read xs; exit $xs)) 4>&1) & ppid=$!; cpid="$cpid $ppid"; echo "+ Child $i (PID $ppid): $c ..."; i=$((i+1)); done; for c in $cpid; do wait $c; cret=$?; [ $cret -eq 0 ] && continue; echo "* Child PID $c has failed." >&2; ret=$cret; done; exit $ret' > /child.sh && chmod +x /child.sh && \
    export PATH=$PATH:/ && \
    echo 'apt-get update && apt-get install autoconf automake libtool build-essential curl git npm golang-go -y' > ./install.sh && chmod +x ./install.sh && \
    ([ -z "$HTTP_PROXY" ] || (echo "Acquire::http::Proxy \"$HTTP_PROXY\";" >> /etc/apt/apt.conf)) && \
    ([ -z "$HTTPS_PROXY" ] || (echo "Acquire::https::Proxy \"$HTTPS_PROXY\";" >> /etc/apt/apt.conf)) && \
    (echo "Acquire::Retries \"8\";" >> /etc/apt/apt.conf) && \
    try.sh ./install.sh && rm ./install.sh && \
    ([ -z "$HTTP_PROXY" ] || (git config --global http.proxy "$HTTP_PROXY" && npm config set proxy "$HTTP_PROXY")) && \
    ([ -z "$HTTPS_PROXY" ] || (git config --global https.proxy "$HTTPS_PROXY" && npm config set https-proxy "$HTTPS_PROXY")) && \
    echo "npm install -g npm || (npm cache clean -f && false) " > ./install.sh && chmod +x ./install.sh && try.sh ./install.sh && rm ./install.sh

# Build the base environment for application libraries
FROM base AS libbase
COPY . /tmp/.build/sshwifty
RUN set -ex && \
    cd / && \
    export PATH=$PATH:/ && \
    try.sh apt-get install libpng-dev -y && \
    ls -l /tmp/.build/sshwifty && \
    child.sh \
        'cd /tmp/.build/sshwifty && echo "npm install || (npm cache clean -f && rm ~/.npm/_* -rf && false)" > ./npm_install.sh && chmod +x ./npm_install.sh && try.sh ./npm_install.sh && rm ./npm_install.sh' \
        'cd /tmp/.build/sshwifty && try.sh go mod download'

# Main building environment
FROM libbase AS builder
RUN set -ex && \
    cd / && \
    export PATH=$PATH:/ && \
    ([ -z "$HTTP_PROXY" ] || (git config --global http.proxy "$HTTP_PROXY" && npm config set proxy "$HTTP_PROXY")) && \
    ([ -z "$HTTPS_PROXY" ] || (git config --global https.proxy "$HTTPS_PROXY" && npm config set https-proxy "$HTTPS_PROXY")) && \
    (cd /tmp/.build/sshwifty && try.sh npm run build && mv ./sshwifty /)

# Build the final image for running
FROM alpine:latest
ENV SSHWIFTY_HOSTNAME= \
    SSHWIFTY_SHAREDKEY= \
    SSHWIFTY_DIALTIMEOUT=10 \
    SSHWIFTY_SOCKS5= \
    SSHWIFTY_SOCKS5_USER= \
    SSHWIFTY_SOCKS5_PASSWORD= \
    SSHWIFTY_LISTENINTERFACE=0.0.0.0 \
    SSHWIFTY_LISTENPORT=8182 \
    SSHWIFTY_INITIALTIMEOUT=0 \
    SSHWIFTY_READTIMEOUT=0 \
    SSHWIFTY_WRITETIMEOUT=0 \
    SSHWIFTY_HEARTBEATTIMEOUT=0 \
    SSHWIFTY_READDELAY=0 \
    SSHWIFTY_WRITEELAY=0 \
    SSHWIFTY_TLSCERTIFICATEFILE= \
    SSHWIFTY_TLSCERTIFICATEKEYFILE= \
    SSHWIFTY_DOCKER_TLSCERT= \
    SSHWIFTY_DOCKER_TLSCERTKEY= \
    SSHWIFTY_PRESETS= \
    SSHWIFTY_ONLYALLOWPRESETREMOTES=
COPY --from=builder /sshwifty /
COPY . /sshwifty-src
RUN set -ex && \
    adduser -D sshwifty && \
    chmod +x /sshwifty && \
    echo '#!/bin/sh' > /sshwifty.sh && echo >> /sshwifty.sh && echo '([ -z "$SSHWIFTY_DOCKER_TLSCERT" ] || echo "$SSHWIFTY_DOCKER_TLSCERT" > /tmp/cert); ([ -z "$SSHWIFTY_DOCKER_TLSCERTKEY" ] || echo "$SSHWIFTY_DOCKER_TLSCERTKEY" > /tmp/certkey); if [ -f "/tmp/cert" ] && [ -f "/tmp/certkey" ]; then SSHWIFTY_TLSCERTIFICATEFILE=/tmp/cert SSHWIFTY_TLSCERTIFICATEKEYFILE=/tmp/certkey /sshwifty; else /sshwifty; fi;' >> /sshwifty.sh && chmod +x /sshwifty.sh
USER sshwifty
EXPOSE 8182
ENTRYPOINT [ "/sshwifty.sh" ]
CMD []