#!/bin/sh

PATH=$PATH:"$(go env GOPATH)/bin"
GO111MODULE=on
ASC_URL=https://keybase.io/nirui/pgp_keys.asc
VERSION_VARIABLE=github.com/niruix/sshwifty/application.version
BUILD_TARGETS="darwin/amd64 windows/386 windows/amd64 openbsd/386 openbsd/amd64 openbsd/arm openbsd/arm64 freebsd/386 freebsd/amd64 freebsd/arm freebsd/arm64 linux/386 linux/amd64 linux/arm linux/arm64 linux/riscv64 linux/ppc64 linux/ppc64le linux/mips linux/mipsle linux/mips64 linux/mips64le"

DOCKER_BUILD_TARGETS="linux/amd64,linux/arm/v7,linux/arm64"
DOCKER_CLI_EXPERIMENTAL=enabled

SSHWIFTY_VERSION=$(git describe --always --dirty='*' --tag)
SSHWIFTY_COMMIT=$(git describe --always)
SSHWIFTY_RELEASE=$([ "$(echo $SSHWIFTY_VERSION | grep -oP ^[0-9]+\.[0-9]+\.[0-9]+\-[a-zA-Z0-9]+\-release$)" = '' ] || echo 'yes')
SSHWIFTY_DEPLOY=$([ "$SSHWIFTY_RELEASE" != 'yes' ] || echo 'yes')
SSHWIFTY_DOCKER_IMAGE_TAG="$DOCKER_HUB_USER/sshwifty"
SSHWIFTY_DOCKER_IMAGE_PUSH_TAG="$SSHWIFTY_DOCKER_IMAGE_TAG:$SSHWIFTY_VERSION"
SSHWIFTY_DOCKER_IMAGE_PUSH_TAG_LATEST="$SSHWIFTY_DOCKER_IMAGE_TAG:latest"

child() {
    cpid=""
    ret=0
    i=0

    echo "+ Spawning $# childs ..."

    for c in "$@"; do
        ( (((((eval "$c"; echo $? >&3) | sed "s/^/\|------ ($i) /" >&4) 2>&1 | sed "s/^/\|------ ($i)!/" >&2) 3>&1) | (read xs; exit $xs)) 4>&1) & ppid=$!

        cpid="$cpid $ppid"

        echo "+ Child $i (PID $ppid): $c ..."

        i=$((i+1))
    done

    for c in $cpid; do
        wait $c

        cret=$?
        [ $cret -eq 0 ] && continue

        echo "* Child PID $c has failed." >&2

        ret=$cret
    done

    return $ret
}

retry() {
    res=0

    for i in $(seq 0 36); do
        $@
        res=$?

        [ $res -eq 0 ] && return $res || sleep 10
    done

    return $res
}

catch() {
    (eval '"$@"')
    res=$?

    [ $res -eq 0 ] && return $res

    echo "Command \"$@\" has failed. Exit code: $res"

    exit $res
}

if [ "$SSHWIFTY_DEPLOY" = 'yes' ]; then
    echo 'Downloading compile & deploy tools ...'

    [ "$(which ghr)" != '' ] || catch retry go get -v github.com/tcnksm/ghr
    [ "$(which gox)" != '' ] || catch retry go get -v github.com/mitchellh/gox

    echo 'Fetching extra references from the repository ...'

    catch retry git fetch --tags --depth 1
fi

echo "Version: $SSHWIFTY_VERSION"
echo "Files: $(pwd)" && ls -la
export
git status --short
git log --pretty=oneline $(git describe --tags --abbrev=0 --match '*-release')..HEAD

catch retry npm install

catch npm run generate

catch go vet ./...
catch npm run testonly

if [ "$SSHWIFTY_DEPLOY" = 'yes' ]; then
    catch child \
        '
        docker login -u "$DOCKER_HUB_USER" -p "$DOCKER_HUB_PASSWORD" &&
        docker buildx create --use --driver docker-container --name buildx-instance &&
        docker buildx build --tag "$SSHWIFTY_DOCKER_IMAGE_PUSH_TAG" --tag "$SSHWIFTY_DOCKER_IMAGE_PUSH_TAG_LATEST" --platform "$DOCKER_BUILD_TARGETS" --build-arg CUSTOM_COMMAND="$DOCKER_CUSTOM_COMMAND" --progress plain --push .
        ' \
        '
        mkdir -p ./.tmp/generated ./.tmp/release &&
        curl "$ASC_URL" > ./.tmp/release/GPG.asc &&
        gpg --import ./.tmp/release/GPG.asc &&
        git archive --format tar --output ./.tmp/release/src HEAD &&
        CGO_ENABLED=0 gox -ldflags "-s -w -X $VERSION_VARIABLE=$SSHWIFTY_VERSION" -osarch "$BUILD_TARGETS" -output "./.tmp/release/{{.Dir}}_${SSHWIFTY_VERSION}_{{.OS}}_{{.Arch}}/{{.Dir}}_{{.OS}}_{{.Arch}}" &&
        echo "# Version $SSHWIFTY_VERSION" > ./.tmp/release/Note &&
        echo >> ./.tmp/release/Note &&
        echo "Updates introduced since $(git describe --abbrev=0 --tags $(git rev-list --tags="*-release" --skip=1 --max-count=1))" >> ./.tmp/release/Note &&
        git log --pretty=format:"- %h %s - (%an) %GK %G?" $(git describe --tags --abbrev=0 --match "*-release")..HEAD >> ./.tmp/release/Note &&
        echo '"'"'#!/bin/sh'"'"' > ./.tmp/generated/prepare.sh &&
        echo '"'"'echo Preparing for $1 ... && \'"'"' >> ./.tmp/generated/prepare.sh &&
        echo '"'"'(cd $1/ && find . -maxdepth 1 -type f ! -name "SUM.*" -exec sha512sum {} \; > SUM.sha512) && \'"'"' >> ./.tmp/generated/prepare.sh &&
        echo '"'"'(cp -v ./*.md $1/) && \'"'"' >> ./.tmp/generated/prepare.sh &&
        echo '"'"'(cp -v ./*.example.json $1/) && \'"'"' >> ./.tmp/generated/prepare.sh &&
        echo '"'"'(cp -v ./.tmp/release/GPG.asc $1/) && \'"'"' >> ./.tmp/generated/prepare.sh &&
        echo '"'"'(cp -v ./.tmp/release/Note $1/) && \'"'"' >> ./.tmp/generated/prepare.sh &&
        echo '"'"'(cp -v ./.tmp/release/src $1/) && \'"'"' >> ./.tmp/generated/prepare.sh &&
        echo '"'"'(cd $1/ && tar zpcvf ../$(basename $(pwd)).tar.gz * --owner=0 --group=0)'"'"' >> ./.tmp/generated/prepare.sh &&
        chmod +x ./.tmp/generated/prepare.sh &&
        find ./.tmp/release/ -maxdepth 1 -type d ! -name "release" -exec ./.tmp/generated/prepare.sh {} \; &&
        find ./.tmp/release/ -maxdepth 1 -type d ! -name "release" -exec rm {} -rf \; &&
        find ./.tmp/release/ -maxdepth 1 -type f -name "*.tar.gz" -execdir sha512sum {} \; > ./.tmp/release/SUM.sha512 &&
        cat ./.tmp/release/SUM.sha512 &&
        ghr -t "$GITHUB_USER_TOKEN" -u "$GITHUB_USER" -n "$SSHWIFTY_VERSION-prebuild" -b "$(cat ./.tmp/release/Note)" -delete -prerelease "$SSHWIFTY_VERSION-prebuild" ./.tmp/release
        '
fi
