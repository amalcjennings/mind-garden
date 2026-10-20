# My Mind Garden

Your digital garden website. Visitors can read it, and you sign in with a password to write.
Notes are saved on Netlify, so you don't need anything else.

## Put it online (one-time setup, about 10 minutes)

You need two free accounts: **GitHub** (stores the files) and **Netlify** (runs the website).

### 1. Put the files on GitHub
1. Sign in at https://github.com and click **New repository** (the **+** at the top right).
2. Name it `mind-garden`, choose **Private**, and click **Create repository**.
3. On the next page, click **uploading an existing file**.
4. Unzip `mind-garden-netlify.zip`. Open the folder, select **the files inside it** (`index.html`, `app.js`,
   `netlify.toml`, `package.json`, the `netlify` folder and the rest), and drag them into the GitHub page.
   Don't drag the outer folder itself.
5. Click **Commit changes**.

**Check:** the repository's main page should list `index.html` and `netlify.toml` right away,
not inside another folder. If they're inside a folder, delete it and upload again.

### 2. Connect it to Netlify
1. Sign in at https://app.netlify.com (you can sign in with your GitHub account).
2. Click **Add new site → Import an existing project → GitHub**, and pick `mind-garden`.
3. Leave all the settings as they are and click **Deploy**.

### 3. Choose your password
1. In Netlify, open your site and go to **Site configuration → Environment variables**.
2. Click **Add a variable**. Key: `EDIT_PASSWORD`. Value: a password of your choice.
3. Go to **Deploys**, click **Trigger deploy → Deploy site**, and wait about a minute.

Done! Netlify shows your site's address (like `something.netlify.app`). You can rename it under
**Site configuration → Change site name**, or connect your own domain under **Domain management**.

**Don't use Netlify's drag-and-drop upload page.** It can't run the part that saves notes,
so the site only works as a read-only copy (it says so at the top right).

## Everyday use
- Open your site and click **Sign in** (top right). Enter your password.
- **Edit** (on a note) or **New note** (top bar), type, press **Save**.
- Link notes with `[[Note title]]`. A grey dashed link means that note doesn't exist yet; click it to write it.
- **Download backup** saves a copy of all your notes to your computer. The site also keeps your last 50 saved versions automatically.
- To share a set of open notes, copy the address from your browser's address bar.
