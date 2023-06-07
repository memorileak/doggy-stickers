const MAX_SUPPORTED_TAG_LENGTH = 8;
const GLOB_STATE = {
  allTags: [],
  tagBuckets: {},
  searchTimeout: null,
  notiTimeout: null,
};

function indexing() {
  return loadStickersCsv()
    .then(clearIndex)
    .then(bucketingTags)
    .then(populateAllTags)
    .catch(handleError);
}

function loadStickersCsv() {
  return axios
    .get('/stickers.csv', {responseType: 'text'})
    .then((res) => parseStickersCsv(res.data))
    .catch(handleError);
}

function clearIndex(csv) {
  GLOB_STATE.allTags = [];
  GLOB_STATE.tagBuckets = {};
  return csv;
}

function parseStickersCsv(csv) {
  const lines = csv.split('\n');
  const parsingResult = [];
  for (const line of lines) {
    let firstCommaIndex = line.indexOf(',');
    const file = line.slice(0, firstCommaIndex);
    if (file) {
      const text = line.slice(firstCommaIndex + 1);
      const tags = text
        .replace(/\"/g, '')
        .replace(/\s*,\s*/g, ',')
        .split(',');
      parsingResult.push({file, tags});
    }
  }
  return parsingResult;
}

function bucketingTags(parsedCsv) {
  for (const {file, tags} of parsedCsv) {
    for (const tag of tags) {
      const c = (tag[0] || '').toLowerCase();
      GLOB_STATE.tagBuckets[c] = GLOB_STATE.tagBuckets[c] || [];
      GLOB_STATE.tagBuckets[c].push([tag, file]);
    }
  }
  return parsedCsv;
}

function populateAllTags(parsedCsv) {
  for (const c of Object.keys(GLOB_STATE.tagBuckets).sort()) {
    const seen = {};
    const tagFilePairs = GLOB_STATE.tagBuckets[c];
    for (const [tag] of tagFilePairs) {
      if (!seen[tag]) {
        GLOB_STATE.allTags.push(tag);
        seen[tag] = true;
      }
    }
  }
  return parsedCsv;
}

function handleError(err) {
  console.error(err);
  alert(err.message);
}

function searchSticker(keyword) {
  const scoreBucketsSize = MAX_SUPPORTED_TAG_LENGTH;
  const scoreBuckets = new Array(scoreBucketsSize);
  const bucket = selectBucket(keyword);
  for (const [tag, file] of bucket) {
    const score = calScore(keyword, tag);
    const index = score - 1;
    scoreBuckets[index] = scoreBuckets[index] || [];
    scoreBuckets[index].push([tag, file]);
  }
  let result = [];
  for (let i = scoreBucketsSize - 1; i >= 0; i -= 1) {
    result = result.concat(scoreBuckets[i] || []);
  }
  return result.slice(0, 100);
}

function selectBucket(keyword) {
  const c = (keyword[0] || '').toLowerCase();
  return GLOB_STATE.tagBuckets[c] || [];
}

function calScore(keyword, tag) {
  const maxScore = MAX_SUPPORTED_TAG_LENGTH;
  let score = 0;
  for (let i = 0; i < maxScore; i += 1) {
    if (keyword[i] && tag[i]) {
      if (keyword[i] === tag[i]) {
        score += 1;
      }
    } else {
      break;
    }
  }
  return score;
}

function loadRecentlyUsed() {
  const raw = localStorage.getItem('recentlyUsed');
  return raw ? JSON.parse(raw) : [];
}

function saveRecentlyUsed([tag, file]) {
  const size = 12;
  const recentlyUsed = [[tag, file]]
    .concat(loadRecentlyUsed().filter(([_, f]) => f !== file))
    .slice(0, size);
  localStorage.setItem('recentlyUsed', JSON.stringify(recentlyUsed));
}

function defaultStickers() {
  const recentlyUsed = loadRecentlyUsed();
  return recentlyUsed.length > 0 ? recentlyUsed : GLOB_STATE.tagBuckets['a'];
}

function writeStickerToClipboard(file) {
  return axios.get(file, {responseType: 'blob'}).then(({data: blob}) =>
    navigator.clipboard.write([
      new ClipboardItem({
        [blob.type]: blob,
      }),
    ])
  );
}

// DOM Manipulation
function renderStickers(tagFilePairs) {
  const mountPointSelector = '#stickers';
  $(mountPointSelector).empty();
  for (const [tag, file] of tagFilePairs) {
    const $stickerItem = $(
      [
        `<div title="Click để sao chép" class="me-2 mb-2 p-2 bg-light position-relative sticker">`,
        `<img alt="${tag}" src="${file}"></img>`,
        `<span class="badge text-bg-light position-absolute top-0 start-0">${tag}</span>`,
        `</div>`,
      ].join('')
    );
    $stickerItem.on('click', function () {
      writeStickerToClipboard(file)
        .then(() => saveRecentlyUsed([tag, file]))
        .then(showCopiedSuccessfulNoti)
        .catch(handleError);
    });
    $(mountPointSelector).append($stickerItem);
  }
}

function renderAllTags(allTags) {
  $('#alltags').empty();
  for (const tag of allTags) {
    const $tagItem = $(
      [`<span class="me-2 mb-2 badge text-bg-light tag">${tag}</span>`].join('')
    );
    $tagItem.on('click', function () {
      $('#searchinput').val(tag);
      $('#searchinput').trigger('keyup');
    });
    $('#alltags').append($tagItem);
  }
}

function bindSearchInputEvent() {
  $('#searchinput').on('keyup', function () {
    clearTimeout(GLOB_STATE.searchTimeout);
    GLOB_STATE.searchTimeout = setTimeout(doSearching, 200);
  });
}

function doSearching() {
  const keyword = $('#searchinput').val();
  if (keyword) {
    const results = searchSticker(keyword);
    renderStickers(results);
  } else {
    renderStickers(defaultStickers());
  }
}

function showCopiedSuccessfulNoti() {
  $('#alertsuccess').css('display', 'flex');
  clearTimeout(GLOB_STATE.notiTimeout);
  GLOB_STATE.notiTimeout = setTimeout(hideCopiedSuccessfulNoti, 3000);
}

function hideCopiedSuccessfulNoti() {
  $('#alertsuccess').css('display', 'none');
}

$(document).ready(function () {
  indexing().then(() => {
    bindSearchInputEvent();
    renderStickers(defaultStickers());
    renderAllTags(GLOB_STATE.allTags);
  });
});
