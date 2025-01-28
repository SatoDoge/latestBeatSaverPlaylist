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
  const path = "data/playlist.json";
  
  // APIからプレイリストのデータを取得
  const newContent = beforeNewPlaylist(getCurrentUTCTime());

  if (!newContent || newContent.songs.length === 0) {
    Logger.log("プレイリストの取得に失敗しました。データが空です。");
    return;
  }

  // JSONを文字列化
  const jsonString = JSON.stringify(newContent, null, 2);
  
  // GitHub上の `playlist.json` のSHAを取得
  const sha = getFileSHA(path);
  Logger.log(`取得したSHA: ${sha}`);

  // GitHub APIリクエスト（ファイル更新 or 新規作成）
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const payload = {
    message: "Update playlist.json via GAS",
    content: Utilities.base64Encode(Utilities.newBlob(jsonString).getBytes()),
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
    
    if (responseCode === 200 || responseCode === 201) {
      Logger.log("プレイリストが正常に更新されました！");
      recreateLatestRelease(jsonString);
    } else {
      Logger.log(`GitHub APIエラー: ${responseCode}`);
      Logger.log(response.getContentText());
    }
  } catch (error) {
    Logger.log("エラー: " + error.message);
  }
}

function recreateLatestRelease(jsonString) {
  const latestRelease = getLatestRelease();

  if (latestRelease) {
    deleteRelease(latestRelease.id);
  }

  createNewRelease(jsonString);
}

function getLatestRelease() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`;
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
    if (response.getResponseCode() === 200) {
      return JSON.parse(response.getContentText());
    } else {
      Logger.log("最新のリリースが見つかりませんでした。");
      return null;
    }
  } catch (error) {
    Logger.log("エラー: " + error.message);
    return null;
  }
}

function deleteRelease(releaseId) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases/${releaseId}`;
  const options = {
    method: "delete",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json"
    },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 204) {
      Logger.log(`リリース (ID: ${releaseId}) を削除しました。`);
    } else {
      Logger.log(`リリース削除エラー: ${response.getResponseCode()}`);
      Logger.log(response.getContentText());
    }
  } catch (error) {
    Logger.log("エラー: " + error.message);
  }
}

function createNewRelease(jsonString) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/releases`;
  const currentDate = getCurrentUTCTime().slice(0, 10); // YYYY-MM-DD フォーマット
  const newTag = currentDate.replace(/-/g, ""); // YYYYMMDD 形式のタグ名

  const payload = {
    tag_name: newTag,
    name: `BeatSaver Maps of ${currentDate}`,  // リリースタイトル
    body: `This release contains the latest BeatSaver maps collected on ${currentDate}.`,
    draft: false,
    prerelease: false
  };

  const options = {
    method: "post",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json"
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    if (response.getResponseCode() === 201) {
      const releaseData = JSON.parse(response.getContentText());
      Logger.log("新しいリリースが作成されました！");
      uploadReleaseAsset(releaseData.upload_url, jsonString, currentDate);
    } else {
      Logger.log(`リリース作成エラー: ${response.getResponseCode()}`);
      Logger.log(response.getContentText());
    }
  } catch (error) {
    Logger.log("エラー: " + error.message);
  }
}

function uploadReleaseAsset(uploadUrl, jsonString, currentDate) {
  const formattedFileName = `BeatSaver_Maps_Yesterday.json`;
  const uploadUrlFormatted = uploadUrl.replace("{?name,label}", `?name=${formattedFileName}`);

  const options = {
    method: "post",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    },
    payload: jsonString,
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(uploadUrlFormatted, options);
    if (response.getResponseCode() === 201) {
      Logger.log(`アセット ${formattedFileName} をリリースに追加しました！`);
    } else {
      Logger.log(`アセットアップロードエラー: ${response.getResponseCode()}`);
      Logger.log(response.getContentText());
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
      "syncURL": `https://github.com/${OWNER}/${REPO}/releases/latest/download/BeatSaver_Maps_Yesterday.json`,
    },
    "songs": [],
    "image": ""
  };

  while (!isEnd) {
//    const requestUrl = `https://api.beatsaver.com/maps/latest?before=2025-01-26T16:41:38.909266Z&pageSize=100`;

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
