const GITHUB_TOKEN = "GITHUB_TOKEN";
const OWNER = "OWNER";
const REPO = "REPO";

/**
 * GitHubの `playlist.json` のSHAを取得
 */
function getFileSHA(path) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const options = {
    method: "get",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json"
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      const json = JSON.parse(response.getContentText());
      return json.sha;
    } else if (responseCode === 404) {
      Logger.log("ファイルが存在しないため、新規作成");
      return null;
    } else {
      Logger.log(`GitHub APIエラー (${responseCode}): ${response.getContentText()}`);
      return null;
    }
  } catch (error) {
    Logger.log("SHA取得エラー: " + error.message);
    return null;
  }
}

/**
 * プレイリストを取得し、GitHubにアップロード
 */
function updatePlaylistOnGitHub() {
  const path = "path";
  
  // APIからプレイリストのデータを取得
  const newContent = beforeNewPlaylist(getCurrentUTCTime());

  if (!newContent || newContent.songs.length === 0) {
    Logger.log("プレイリストの取得に失敗しました。データが空です。");
    return;
  }

  // JSONを文字列化 → Base64エンコード
  const jsonString = JSON.stringify(newContent, null, 2);
  const encodedContent = Utilities.base64Encode(Utilities.newBlob(jsonString).getBytes());

  // GitHub上の `playlist.json` のSHAを取得
  const sha = getFileSHA(path);
  Logger.log(`取得したSHA: ${sha}`);

  // GitHub APIリクエスト（ファイル更新 or 新規作成）
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const payload = {
    message: "Update playlist.json via GAS",
    content: encodedContent,
    sha: sha || undefined, // SHAが `null` の場合は新規作成
  };

  const options = {
    method: "put",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200 || responseCode === 201) {
      Logger.log("プレイリストが正常に更新されました！");
    } else {
      Logger.log(`GitHub APIエラー: ${responseCode}`);
      Logger.log(responseText);
    }
  } catch (error) {
    Logger.log("エラー: " + error.message);
  }
}

/**
 * プレイリストデータをAPIから取得
 */
function beforeNewPlaylist(dateString) {
  let isEnd = false;
  const newDate = new Date(dateString);
  newDate.setUTCDate(newDate.getUTCDate() - 1);
  console.log(newDate);
  let latestDate = dateString;
  const playlistJson = {
    "playlistTitle": `${newDate.toISOString()}~${dateString}`,
    "playlistAuthor": "latestBeatSaverPlaylist",
    "discripstion": `Maps published between ${newDate.toISOString()} and ${dateString}`,
    "customData": {
      "syncURL": "https://raw.githubusercontent.com/SatoDoge/latestBeatSaverPlaylist/main/data/playlist.json",
    },
    "songs": [],
    "image": ""
  };

  while (!isEnd) {
    const requestUrl = `https://api.beatsaver.com/maps/latest?before=${latestDate}&pageSize=100`;
    console.log(`Fetching: ${requestUrl}`);

    try {
      // GASでは fetch() ではなく、UrlFetchApp.fetch() を使用
      const response = UrlFetchApp.fetch(requestUrl, { muteHttpExceptions: true });
      const jsonData = JSON.parse(response.getContentText());
      console.log(jsonData);
      if (!jsonData.docs || jsonData.docs.length === 0) {
        console.log("データがないため終了");
        break;
      }

      for (const mapData of jsonData.docs) {
        const publishedDate = new Date(mapData.lastPublishedAt);
        console.log("秒数:",publishedDate.getTime(),newDate.getTime());
        if (publishedDate.getTime() < newDate.getTime()) {
          isEnd = true;
          break;
        }

        playlistJson.songs.push({
          "key": mapData.id,
          "songName": mapData.name,
          "hash": mapData.versions[0].hash,
          "levelid": `custom_level_${mapData.versions[0].hash}`
        });
      }

      latestDate = jsonData.docs[jsonData.docs.length - 1]?.lastPublishedAt || latestDate;
      isEnd = true;
    } catch (error) {
      console.error("エラー発生:", error);
      break;
    }
  }

  console.log("最終的なプレイリスト:", playlistJson);
  return playlistJson;
}

function getCurrentUTCTime() {
  const now = new Date();
  const isoString = now.toISOString();

  return isoString
}
