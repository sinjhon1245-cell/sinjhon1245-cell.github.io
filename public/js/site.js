// Shows the styled placeholder box in place of an <img> whose file hasn't been supplied yet.
function imgFallback(img) {
  img.style.display = 'none';
  var placeholder = img.nextElementSibling;
  if (placeholder && placeholder.classList.contains('img-placeholder')) {
    placeholder.style.display = 'flex';
  }
}
