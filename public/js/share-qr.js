import qrcode from './vendor/qrcode-generator.js';

export function shareQrImage(link) {
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  return qr.createDataURL(8, 32);
}

export function mountShareQr(host) {
  host.classList.add('share-qr');
  host.innerHTML = `
    <button type="button" aria-expanded="false" disabled>Tạo mã QR</button>
    <div class="share-qr-result" hidden>
      <img alt="Mã QR của liên kết chia sẻ">
      <a download="ma-qr-gia-pha.gif">Tải ảnh QR</a>
    </div>
    <p role="status" class="share-qr-status"></p>`;
  const button = host.querySelector('button');
  const result = host.querySelector('.share-qr-result');
  const image = result.querySelector('img');
  const download = result.querySelector('a');
  const status = host.querySelector('[role="status"]');
  let link = '';

  function hide() {
    result.hidden = true;
    image.removeAttribute('src');
    download.removeAttribute('href');
    button.setAttribute('aria-expanded', 'false');
    button.textContent = 'Tạo mã QR';
    status.textContent = '';
  }

  button.onclick = () => {
    if (!result.hidden) {
      hide();
      return;
    }
    if (!link) return;
    try {
      const src = shareQrImage(link);
      image.src = src;
      download.href = src;
      result.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      button.textContent = 'Ẩn mã QR';
    } catch {
      status.textContent = 'Không tạo được mã QR. Bạn vẫn có thể sao chép liên kết.';
    }
  };

  return nextLink => {
    link = nextLink;
    hide();
    button.disabled = !link;
  };
}
