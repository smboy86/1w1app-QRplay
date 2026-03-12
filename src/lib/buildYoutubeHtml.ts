export function buildYoutubeHtml(videoId: string, appOrigin: string, autoplay = true): string {
  const playerVars = {
    autoplay: autoplay ? 1 : 0,
    controls: 0,
    disablekb: 1,
    fs: 0,
    rel: 0,
    playsinline: 1,
    enablejsapi: 1,
    iv_load_policy: 3,
    origin: appOrigin,
    modestbranding: 1,
    hl: "ko",
  };

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
    />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: #000;
        width: 100%;
        height: 100%;
        overflow: hidden;
      }

      #player {
        position: fixed;
        inset: 0;
      }
    </style>
  </head>
  <body>
    <div id="player"></div>
    <script>
      var player = null;
      var pausedByApp = false;
      var progressTimer = null;
      var lastProgressKey = "";

      function send(type, payload) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: type, payload: payload || null })
          );
        }
      }

      // 현재 영상 길이와 재생 위치를 안전하게 읽어온다.
      function getPlaybackMetrics() {
        if (!player) {
          return { durationSeconds: 0, currentTimeSeconds: 0 };
        }

        var durationSeconds = 0;
        var currentTimeSeconds = 0;

        if (typeof player.getDuration === "function") {
          durationSeconds = Number(player.getDuration()) || 0;
        }

        if (typeof player.getCurrentTime === "function") {
          currentTimeSeconds = Number(player.getCurrentTime()) || 0;
        }

        return {
          durationSeconds: Math.max(0, durationSeconds),
          currentTimeSeconds: Math.max(0, currentTimeSeconds),
        };
      }

      // 재생 길이와 현재 위치를 네이티브 UI에 동기화한다.
      function publishPlaybackSnapshot(force) {
        var metrics = getPlaybackMetrics();
        var snapshotKey =
          Math.round(metrics.durationSeconds) + ":" + Math.round(metrics.currentTimeSeconds);

        if (!force && snapshotKey === lastProgressKey) {
          return;
        }

        lastProgressKey = snapshotKey;
        send("progress", metrics);
      }

      // 진행 시간 동기화 타이머를 한 번만 시작한다.
      function ensureProgressTimer() {
        if (progressTimer) {
          return;
        }

        progressTimer = setInterval(function() {
          publishPlaybackSnapshot(false);
        }, 1000);
      }

      // 진행 시간 동기화 타이머를 정리한다.
      function clearProgressTimer() {
        if (!progressTimer) {
          return;
        }

        clearInterval(progressTimer);
        progressTimer = null;
      }

      function onYouTubeIframeAPIReady() {
        player = new YT.Player("player", {
          width: "100%",
          height: "100%",
          videoId: ${JSON.stringify(videoId)},
          playerVars: ${JSON.stringify(playerVars)},
          events: {
            onReady: function(event) {
              ensureProgressTimer();

              window.__YT_PLAY__ = function() {
                if (!player) return;
                pausedByApp = false;
                ensureProgressTimer();
                player.playVideo();
                publishPlaybackSnapshot(true);
              };
              window.__YT_PAUSE__ = function() {
                if (!player) return;

                var currentTime = 0;
                if (typeof player.getCurrentTime === "function") {
                  currentTime = player.getCurrentTime() || 0;
                }

                pausedByApp = true;
                player.cueVideoById({
                  videoId: ${JSON.stringify(videoId)},
                  startSeconds: currentTime,
                });
                publishPlaybackSnapshot(true);
                send("paused");
              };
              window.__YT_REPLAY__ = function() {
                if (!player) return;
                pausedByApp = false;
                ensureProgressTimer();
                if (typeof player.seekTo === "function") {
                  player.seekTo(0, true);
                }
                player.playVideo();
                publishPlaybackSnapshot(true);
              };
              window.__YT_STOP__ = function() {
                if (!player) return;
                pausedByApp = false;
                player.stopVideo();
                publishPlaybackSnapshot(true);
              };
              window.__YT_DESTROY__ = function() {
                clearProgressTimer();

                if (player) {
                  player.destroy();
                }
              };

              publishPlaybackSnapshot(true);
              send("ready");

              ${autoplay ? "event.target.playVideo();" : ""}
            },
            onStateChange: function(event) {
              send("state", { state: event.data });
              publishPlaybackSnapshot(true);

              if (event.data === YT.PlayerState.PLAYING) {
                ensureProgressTimer();
                send("playing");
              }
              if (event.data === YT.PlayerState.PAUSED && !pausedByApp) send("paused");
              if (event.data === YT.PlayerState.ENDED) {
                clearProgressTimer();
                send("ended");
              }
              if (event.data === YT.PlayerState.BUFFERING) send("buffering");
              if (event.data === YT.PlayerState.CUED) send("cued");
            },
            onError: function(event) {
              clearProgressTimer();
              send("error", { code: event.data });
            },
            onAutoplayBlocked: function() {
              publishPlaybackSnapshot(true);
              send("autoplayBlocked");
            }
          }
        });
      }

      var tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    </script>
  </body>
</html>`;
}
