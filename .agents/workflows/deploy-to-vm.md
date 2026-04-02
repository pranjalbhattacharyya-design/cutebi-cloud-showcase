---
description: Deploy frontend and/or backend changes to the GCP VM at 34.45.93.194
---

# CuteBI — GCP VM Deploy Workflow

SSH into the VM first:
```bash
ssh pranjal.bhattacharyya@34.45.93.194
```

Then run the relevant section below inside the VM.

---

## FRONTEND ONLY (React UI / JSX / CSS changes)

```bash
cd ~/cutebi-cloud-showcase
git pull origin main
npm run build
```
> Nginx picks up the new dist/ automatically. No restart needed.

---

## BACKEND ONLY (main.py changes)

```bash
cd ~/cutebi-cloud-showcase
git pull origin main
sudo systemctl restart cutebi
```

---

## FRONTEND + BACKEND (both changed)

```bash
cd ~/cutebi-cloud-showcase
git pull origin main
npm run build
sudo systemctl restart cutebi
```

---

## NEW PYTHON PACKAGES (requirements.txt changed)

```bash
cd ~/cutebi-cloud-showcase
git pull origin main
source venv/bin/activate
pip install -r backend/requirements.txt
npm run build
sudo systemctl restart cutebi
```

---

## Check backend status / logs

```bash
sudo systemctl status cutebi
sudo journalctl -u cutebi -n 50 --no-pager
```
