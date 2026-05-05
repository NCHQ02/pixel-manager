/**
 * Custom Promise-based Confirmation Modal
 */
export function showConfirm(title, message) {
  const overlay = document.getElementById("modal-overlay");
  const titleEl = document.getElementById("modal-title");
  const messageEl = document.getElementById("modal-message");
  const cancelBtn = document.getElementById("modal-cancel");
  const confirmBtn = document.getElementById("modal-confirm");

  titleEl.textContent = title;
  messageEl.textContent = message;
  overlay.style.display = "flex";

  return new Promise((resolve) => {
    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    const handleConfirm = () => {
      cleanup();
      resolve(true);
    };

    const cleanup = () => {
      overlay.style.display = "none";
      cancelBtn.removeEventListener("click", handleCancel);
      confirmBtn.removeEventListener("click", handleConfirm);
    };

    cancelBtn.addEventListener("click", handleCancel);
    confirmBtn.addEventListener("click", handleConfirm);
    
    // Close on overlay click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) handleCancel();
    }, { once: true });
  });
}
