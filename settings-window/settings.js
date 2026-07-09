(async () => {
  const existing = await window.api.getSettings();
  if (existing.accessKeyId) document.getElementById('accessKeyId').value = existing.accessKeyId;
  if (existing.secretAccessKey) document.getElementById('secretAccessKey').value = existing.secretAccessKey;
  if (existing.region) document.getElementById('region').value = existing.region;
  if (existing.bucket) document.getElementById('bucket').value = existing.bucket;

  document.getElementById('btn-cancel').addEventListener('click', () => window.close());

  document.getElementById('btn-save').addEventListener('click', async () => {
    const accessKeyId = document.getElementById('accessKeyId').value.trim();
    const secretAccessKey = document.getElementById('secretAccessKey').value.trim();
    const region = document.getElementById('region').value.trim();
    const bucket = document.getElementById('bucket').value.trim();
    const errEl = document.getElementById('error-msg');

    if (!accessKeyId || !secretAccessKey || !region || !bucket) {
      errEl.textContent = 'All fields are required.';
      errEl.style.display = 'block';
      return;
    }

    errEl.style.display = 'none';
    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';

    try {
      await window.api.saveSettings({ accessKeyId, secretAccessKey, region, bucket });
    } catch (e) {
      errEl.textContent = e.message || 'Failed to save settings.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Save & Continue';
    }
  });
})();
