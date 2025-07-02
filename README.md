# Mukul Jangra

This is a simple, modern, and responsive Jekyll website. It supports posts, custom pages, search, and easy deployment to GitHub Pages or any static hosting.

## Getting Started

### 1. Clone the Repository

```sh
git clone https://github.com/your-username/your-repo.git
cd your-repo
```

### 2. Install Dependencies

Make sure you have [Ruby](https://www.ruby-lang.org/en/documentation/installation/) and [Bundler](https://bundler.io/) installed.

```sh
gem install bundler
bundle install
```

### 3. Configure Your Site

Edit the `_config.yml` file to set your site's details:

- `url`: Your site's URL (e.g., `https://yourdomain.com`)
- `site_name`: The name of your site
- `site_tagline`: A short tagline or description
- Social links: `site_github`, `site_nostr`, `site_mastodon`, `site_twitter`
- You can also adjust plugins, collections, and other Jekyll settings as needed.

### 4. Add Your Blog Posts

All blog posts live in the `_posts` directory. Each post is a Markdown file named in the format `YYYY-MM-DD-title.md`. Example:

```markdown
---
title: My First Post
layout: post
categories: post
tags:
  - Example
  - Getting Started
---

Your post content goes here!
```

- Posts are rendered using the `_layouts/post.html` template.
- You can use front matter to set the title, tags, categories, and more.
- Posts will automatically appear on the homepage, grouped and filterable by tags.

### 5. Search Functionality

- The search bar is included in the sidebar and uses the `search.json` file for instant search.
- `search.json` is auto-generated from your posts. No extra setup is needed—just add posts and rebuild.

### 6. Local Development

To preview your site locally:

```sh
bundle exec jekyll serve
```

Visit `http://localhost:4000` in your browser.

### 7. Deployment

#### Deploy to GitHub Pages

1. Push your repository to GitHub.
2. In your repository settings, enable GitHub Pages (usually from the `main` branch or `/docs` folder).
3. GitHub Actions will automatically build and deploy your site using the included workflow.

#### Deploy Elsewhere

- Run `bundle exec jekyll build` to generate the static site in the `_site` directory.
- Upload the contents of `_site` to any static hosting provider (Netlify, Vercel, Cloudflare Pages, etc).

## Customization

- **Homepage:** Controlled by `_layouts/home.html` and `index.html`.
- **Post Layout:** Customize `_layouts/post.html` for post appearance.
- **Styles:** Edit files in `static/` for CSS and images.
- **Navigation & Sidebar:** Update links and content in the layout files.

## Notes

- Update `_config.yml` to match your needs before deploying.
- The `_posts` folder is where all your blog content lives.
- The site uses Jekyll's standard structure, so you can add custom pages, collections, and plugins as needed.