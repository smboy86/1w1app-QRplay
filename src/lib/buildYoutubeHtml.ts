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

      function send(type, payload) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(
            JSON.stringify({ type: type, payload: payload || null })
          );
        }
      }

      function onYouTubeIframeAPIReady() {
        player = new YT.Player("player", {
          width: "100%",
          height: "100%",
          videoId: ${JSON.stringify(videoId)},
          playerVars: ${JSON.stringify(playerVars)},
          events: {
            onReady: function(event) {
              window.__YT_PLAY__ = function() {
                if (!player) return;
                pausedByApp = false;
                player.playVideo();
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
                send("paused");
              };
              window.__YT_STOP__ = function() {
                if (!player) return;
                pausedByApp = false;
                player.stopVideo();
              };
              window.__YT_DESTROY__ = function() { if (player) player.destroy(); };

              send("ready");

              ${autoplay ? "event.target.playVideo();" : ""}
            },
            onStateChange: function(event) {
              send("state", { state: event.data });

              if (event.data === YT.PlayerState.PLAYING) send("playing");
              if (event.data === YT.PlayerState.PAUSED && !pausedByApp) send("paused");
              if (event.data === YT.PlayerState.ENDED) send("ended");
              if (event.data === YT.PlayerState.BUFFERING) send("buffering");
              if (event.data === YT.PlayerState.CUED) send("cued");
            },
            onError: function(event) {
              send("error", { code: event.data });
            },
            onAutoplayBlocked: function() {
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
