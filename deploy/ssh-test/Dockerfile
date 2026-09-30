FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends openssh-server procps \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/bash lab \
    && echo 'lab:lab-test-only' | chpasswd && mkdir -p /run/sshd
EXPOSE 22
CMD ["/bin/sh", "-c", "ssh-keygen -A && exec /usr/sbin/sshd -D -e -o PasswordAuthentication=yes -o AllowTcpForwarding=yes -o PermitRootLogin=no"]
