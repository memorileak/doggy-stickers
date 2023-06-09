const MAX_SUPPORTED_TAG_LENGTH = 8;
const RECENTLY_USED_HISTORY_SIZE = 16;
const STICKERS_DIR = '/stickers';
const TAGS_DIR = '/tags';
const GLOB_STATE = {
  allTags: [],
  allFiles: [],
  tagBuckets: {},
  searchTimeout: null,
  notiTimeout: null,
};

function indexing() {
  return loadStickersCsv()
    .then(clearIndex)
    .then(populateAllFiles)
    .then(bucketingTags)
    .then(populateAllTags)
    .catch(handleError);
}

async function loadStickersCsv() {
  try {
    const res = await axios.get('/tags.csv', {responseType: 'text'});
    const tagsIndexData = res.data;
    const tagFilesNeedToLoad = tagsIndexData
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f);
    let fileTagsPairs = [];
    for (const tagFile of tagFilesNeedToLoad) {
      const parsedCsvData = await loadStickersCsvFile(`${TAGS_DIR}${tagFile}`);
      fileTagsPairs = fileTagsPairs.concat(parsedCsvData);
    }
    return fileTagsPairs;
  } catch (err) {
    handleError(err);
  }
}

function loadStickersCsvFile(csvFile) {
  return axios
    .get(csvFile, {responseType: 'text'})
    .then((res) => parseStickersCsv(res.data))
    .catch(handleError);
}

function clearIndex(csv) {
  GLOB_STATE.allTags = [];
  GLOB_STATE.allFiles = [];
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
      parsingResult.push([file, tags]);
    }
  }
  return parsingResult;
}

function populateAllFiles(parsedCsv) {
  GLOB_STATE.allFiles = [...parsedCsv];
  return parsedCsv;
}

function bucketingTags(parsedCsv) {
  for (const [file, tags] of parsedCsv) {
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
  return result;
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
  return raw
    ? JSON.parse(raw).map(([tag, file]) => [
      tag,
      file.replace(/^\/stickers/, ''),
    ])
    : [];
}

function saveRecentlyUsed([tag, file]) {
  const size = RECENTLY_USED_HISTORY_SIZE;
  const recentlyUsed = [[tag, file]]
    .concat(loadRecentlyUsed().filter(([_, f]) => f !== file))
    .slice(0, size);
  localStorage.setItem('recentlyUsed', JSON.stringify(recentlyUsed));
}

function defaultStickers() {
  const recentlyUsed = loadRecentlyUsed();
  const randStickers = randomStickers(32);
  const result = [];
  const seen = {};
  for (const [tag, file] of recentlyUsed.concat(randStickers)) {
    if (!seen[file]) {
      result.push([tag, file]);
      seen[file] = true;
    }
  }
  return result;
}

function randomStickers(quantity) {
  const l = GLOB_STATE.allFiles.length;
  if (quantity < l) {
    let s = 0;
    let ss = 0;
    const seen = {};
    const result = [];
    while (s < quantity && ss < 2 * quantity) {
      const i = randomInt(l);
      if (!seen[i]) {
        const [f, [t]] = GLOB_STATE.allFiles[i];
        result.push([t, f]);
        seen[i] = true;
        s += 1;
      }
      ss += 1;
    }
    return result;
  } else {
    return GLOB_STATE.allFiles.map(([f, [t]]) => [t, f]);
  }
}

function randomInt(exclusiveMax) {
  return Math.floor(Math.random() * exclusiveMax);
}

function writeStickerToClipboard(file) {
  return axios
    .get(`${STICKERS_DIR}${file}`, {responseType: 'blob'})
    .then(({data: blob}) =>
      navigator.clipboard.write([
        new ClipboardItem({
          [blob.type]: blob,
        }),
      ])
    );
}

// DOM Manipulation
function renderStickers(tagFilePairs) {
  $('#stickers').empty();
  for (const [tag, file] of tagFilePairs) {
    const $stickerItem = $(
      [
        `<div title="Click to copy" class="me-2 mb-2 p-2 bg-light position-relative sticker">`,
        `<img alt="${tag}" src="${STICKERS_DIR}${file}"></img>`,
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
    $('#stickers').append($stickerItem);
  }
}

function renderAllTags() {
  const allTags = GLOB_STATE.allTags;
  $('#alltags').empty();
  for (const tag of allTags) {
    const $tagItem = $(
      [`<span class="me-2 mb-2 badge text-bg-light tag">${tag}</span>`].join('')
    );
    $tagItem.on('click', function () {
      $(window).scrollTop(0);
      $('#searchinput').val(tag);
      $('#searchinput').trigger('focus');
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
    const stickers = searchSticker(keyword);
    renderStickers(stickers);
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

// Setup the custom autocomplete widget
$.widget('custom.intellisense', $.ui.autocomplete, {
  _resizeMenu: function () {
    this.menu.element.outerWidth(240);
    this.menu.element.outerHeight(480);
    this.menu.element.css('overflow-x', 'hidden');
    this.menu.element.css('overflow-y', 'auto');
  }
});

function enableSearchingAutocomplete() {
  const $searchInput = $('#searchinput');
  $searchInput.intellisense({
    source: GLOB_STATE.allTags,
    select: function () {
      $searchInput.trigger('keyup');
    },
  });
}

$(document).ready(function () {
  indexing().then(() => {
    bindSearchInputEvent();
    enableSearchingAutocomplete();
    renderStickers(defaultStickers());
    renderAllTags();
  });
});
