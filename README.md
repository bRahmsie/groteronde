# Wielermanager — Deployment Gids

## Vereisten
- GitHub account (gratis)
- Supabase project (stap 1 al gedaan ✓)
- Vercel account (gratis)

---

## Stap 1 — Supabase keys ophalen

1. Ga naar je Supabase project → **Project Settings** → **API**
2. Kopieer:
   - **Project URL** (bv. `https://xyzxyz.supabase.co`)
   - **anon / public** key (lange string)

3. Open het bestand `js/supabase.js` en vul in:
```js
const SUPABASE_URL  = 'https://JOUW-PROJECT.supabase.co';
const SUPABASE_ANON = 'JOUW-ANON-KEY';
```

---

## Stap 2 — Code op GitHub zetten

### Optie A: via GitHub website (eenvoudigst)
1. Ga naar [github.com](https://github.com) → **New repository**
2. Geef het de naam `wielermanager`, zet op **Public** of **Private**
3. Klik **Create repository**
4. Sleep de volledige map naar de "upload files" knop op GitHub

### Optie B: via terminal
```bash
cd wielermanager
git init
git add .
git commit -m "eerste versie"
git remote add origin https://github.com/JOUW-NAAM/wielermanager.git
git push -u origin main
```

---

## Stap 3 — Deployen op Vercel

1. Ga naar [vercel.com](https://vercel.com) → **Add New Project**
2. Klik **Import** naast je `wielermanager` repository
3. **Framework Preset**: kies `Other`
4. **Root Directory**: laat leeg (of `.`)
5. Klik **Deploy**

Vercel detecteert automatisch de `vercel.json` en deployt de statische bestanden.

Na ~30 seconden krijg je een URL zoals `https://wielermanager-xyz.vercel.app` 🎉

---

## Stap 4 — Supabase CORS instellen

1. Ga naar Supabase → **Authentication** → **URL Configuration**
2. Voeg toe bij **Site URL**: je Vercel URL (bv. `https://wielermanager-xyz.vercel.app`)
3. Voeg toe bij **Redirect URLs**: dezelfde URL + `/*`
4. Klik **Save**

---

## Stap 5 — Jezelf admin maken

1. Registreer je via de app op je Vercel URL
2. Ga naar Supabase → **SQL Editor** → voer uit:
```sql
update public.profiles
set is_admin = true
where email = 'jouw@email.be';
```
3. Log uit en opnieuw in → je ziet nu het Admin-tabblad

---

## Updates deployen

Elke keer als je een bestand aanpast en naar GitHub pusht, deployt Vercel automatisch de nieuwe versie. Geen extra stappen nodig.

```bash
git add .
git commit -m "aanpassing beschrijving"
git push
```

---

## Mapstructuur

```
wielermanager/
├── index.html          ← hoofdpagina
├── vercel.json         ← Vercel routing config
├── css/
│   └── style.css       ← alle stijlen
└── js/
    ├── supabase.js     ← ← VUL HIER JE KEYS IN
    ├── helpers.js      ← jersey SVG, punten engine, Excel parser
    ├── pages.js        ← pagina renders (competitie, selectie, ploeg, klassement)
    ├── admin.js        ← admin paneel (gebruikers, uitslagen, CSV import)
    └── app.js          ← auth, routing, globale acties
```

---

## Problemen?

**"Failed to fetch"** → controleer je Supabase URL en anon key in `js/supabase.js`

**Lege pagina na login** → controleer Supabase CORS instellingen (stap 4)

**Admin-tabblad niet zichtbaar** → voer de SQL uit uit stap 5
