'use strict';

// ═══════════════════════════════════════════
// [3] Gallery
// ═══════════════════════════════════════════
async function loadGallery() {
  try {
    const res      = await TAZA.Http.get(TAZA.API.COMM.IMAGES_LIST);
    _galleryImages = res?.data?.all_images ?? res?.data?.images ?? [];
    renderGallery(_galleryImages);
  } catch(e) { TAZA.Toast.apiError(e); }
}

function renderGallery(images) {
  const grid = document.getElementById('gallery-grid');
  const isAr = TAZA.Lang.current === 'ar';
  if (!grid) return;

  grid.innerHTML = `
    <label class="gallery-add" style="cursor:pointer">
      <input type="file" accept="image/*" multiple style="display:none"
             onchange="handleGalleryFileInput(event)">
      <div class="gallery-add-icon">📷</div>
      <div class="gallery-add-text">${isAr ? 'إضافة صورة' : 'Add Photo'}</div>
    </label>
    ${images.map(img => `
      <div class="gallery-item" data-id="${img.id}">
        <img src="${TAZA.Media.url(img.image_url || img.url)}" alt="Gallery" loading="lazy">
        <div class="gallery-item-overlay">
          <button class="btn btn-danger btn-sm" data-action="delete-image" data-id="${img.id}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('')}
  `;

  // Update count in overview
  const countEl = document.getElementById('gallery-count-stat');
  if (countEl) countEl.textContent = images.length;
}

function handleGalleryFileInput(e) {
  const files = Array.from(e.target.files ?? []);
  if (files.length) uploadGalleryBatch(files);
}

async function uploadGalleryImages(e) {
  const files = Array.from(e.target.files ?? []);
  if (!files.length) return;
  uploadGalleryBatch(files);
  e.target.value = '';
}

async function uploadGalleryBatch(files) {
  const progressWrap = document.getElementById('upload-progress-wrap');
  const progressBar  = document.getElementById('upload-progress-bar');
  const progressText = document.getElementById('upload-progress-text');
  const isAr         = TAZA.Lang.current === 'ar';
  const validFiles   = files.filter(f => TAZA.Utils.isImageFile(f));

  if (!validFiles.length) {
    TAZA.Toast.warning(isAr ? 'لم يتم اختيار صور صحيحة' : 'No valid images selected');
    return;
  }

  if (progressWrap) progressWrap.style.display = 'block';
  let uploaded = 0;

  for (const file of validFiles) {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('type', 'food');
    fd.append('caption', file.name.replace(/\.[^.]+$/, ''));
    try {
      await TAZA.Http.upload(TAZA.API.COMM.IMAGE_UPLOAD, fd);
      uploaded++;
      const pct = Math.round((uploaded / validFiles.length) * 100);
      if (progressBar) progressBar.style.width = pct + '%';
      if (progressText) progressText.textContent = `${isAr?'جارٍ رفع':'Uploading'} ${uploaded}/${validFiles.length}...`;
    } catch(err) {
      TAZA.Toast.error(`${isAr?'فشل رفع':'Failed to upload'} ${file.name}`);
    }
  }

  if (progressWrap) setTimeout(() => { progressWrap.style.display = 'none'; progressBar.style.width = '0%'; }, 1000);
  TAZA.Toast.success(`${isAr?'تم رفع':'Uploaded'} ${uploaded} ${isAr?'صورة':'image(s)'}`);
  _galleryImages = [];
  loadGallery();
}

async function handleGalleryAction(e) {
  const btn = e.target.closest('[data-action="delete-image"]');
  if (!btn) return;
  const id   = parseInt(btn.dataset.id);
  const isAr = TAZA.Lang.current === 'ar';

  TAZA.Confirm.show(
    isAr ? 'حذف هذه الصورة نهائياً؟' : 'Delete this image permanently?',
    async () => {
      try {
        await TAZA.Http.delete(TAZA.API.COMM.IMAGE_DELETE(id));
        TAZA.Toast.success(isAr ? 'تم حذف الصورة' : 'Image deleted');
        _galleryImages = [];
        loadGallery();
      } catch(err) { TAZA.Toast.apiError(err); }
    },
    { danger: true }
  );
}
