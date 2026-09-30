# Shop — Design Reference

Use alongside `project.md`. This file guides appearance; the project document defines functionality and payment behavior.

## Source and Direction

Based on the supplied `Shopping App.png` (enlarged upper page) and `Shopping App (1).png` (full page), from the [Figma prototype](https://www.figma.com/proto/9iUUj6AbdVRjNjE6syWEes/Shopping-Website--Community-?node-id=2-221&scaling=min-zoom&content-scaling=fixed&page-id=2%3A2).

Both images show a **desktop fashion storefront**. No mobile, cart, login, or checkout designs were supplied. Their layouts below are proposed adaptations. Colours were sampled from the PNGs; font family, original pixel dimensions, and interactions cannot be confirmed from screenshots.

Visual direction: white canvas, oversized heavy black typography, warm yellow highlights, generous spacing, and large editorial fashion photography. Keep surfaces flat, with rounded image corners and little shadow. Do not recreate the black textured surround/drop shadow around the first screenshot; it is presentation framing.

## Palette and Typography

Define these once as CSS custom properties in `globals.css`:

| Token | Value | Use |
| --- | --- | --- |
| `--color-background` | `#FFFFFF` | Main page |
| `--color-text` | `#000000` | Headings, primary buttons, footer |
| `--color-surface` | `#F4F6F5` | Hero background |
| `--color-accent` | `#EBD96B` | Hero highlight, brand band, heading flourish |
| `--color-accent-strong` | `#E5C643` | Lower promotional band in reference |
| `--color-muted` | `#666666` | Supporting text; darker adaptation of screenshot grey |
| `--color-border` | `#E5E7EB` | Suggested cart/checkout dividers |

Use black text on yellow, white text on black, and dark text on white. The reference's white text on yellow is adapted to dark text for readability. Keep success/error colours semantic and separate from the branding.

Use **Poppins or a similar geometric sans-serif** as an implementation approximation. Headings need very heavy weight, tight line spacing, and selective uppercase text. Body copy stays regular and compact. Suggested desktop sizes: hero 64–80px, section titles 28–36px, card titles 18–22px, body 16px, navigation 14px. On phones, reduce the hero to roughly 40–48px. Exact sizes are recommended starting points, not extracted Figma values.

## Reference Page, Top to Bottom

1. **Header:** compact black fashion mark/wordmark at left; uppercase navigation at right; black rectangular Sign up button. White background and generous horizontal margins.
2. **Hero:** large rounded pale-grey panel, copy on the left and a cutout model wearing pink on the right. The headline breaks into four lines: “LET’S / EXPLORE / UNIQUE / CLOTHES.” Slightly rotated white and yellow rectangles sit behind selected lines. Supporting copy and a black Shop now button follow. Pale star shapes decorate the image area.
3. **Brand band:** full-width soft-yellow strip with six evenly spaced brand logos.
4. **New arrivals:** bold left-aligned heading with a small yellow swoosh beneath part of the text. Three equal portrait image cards: hoodies, coats, and tees. Each has rounded image corners, a title, grey supporting link text, and a slim right arrow. No heavy card border or shadow.
5. **Sale banner:** full-width bright-yellow image composition; model on the left, large stacked black headline and CTA on the right, with a white headline highlight and star decorations.
6. **Young’s favourite:** two wide photographic cards with the same title/supporting-text/arrow pattern.
7. **App promotion:** copy and app-store badges on the left, phone mockup and decorative circles on the right.
8. **Email promotion:** yellow band, centred heading/copy, white email field with an inset black Send button.
9. **Footer:** black background; brand, short description, and yellow social icons at left; muted link columns at right.

## Apply to This Small Shop

The default homepage uses **header → hero → product grid → footer**. Translate the reference's category cards into the six real database products: photo, product name, NGN price, and Add to cart. Keep the photography-led layout and yellow heading flourish. Use three columns on desktop.

Use a simple shop wordmark. Header links should be Shop and Cart, with the cart count and Continue with Google/account control. Shop now scrolls to the product grid. All visible controls must work.

The original sale, favourites, app-download, newsletter, and tracking sections are visual references, not required features. Omit them from this cohort build. Do not copy obsolete sale dates, dollar prices, discount claims, or imply partnerships with the displayed brands. Product images should come from usable assets; do not crop the supplied page screenshot into individual product pictures.

## Layout and Components

Suggested desktop container: maximum 1280px, centred, with 40–64px outer gutters. Use 80–100px between major sections, 24–40px grid gaps, and a small spacing scale of 8/16/24/32/48px. At smaller widths use 16–24px gutters and 40–56px section spacing.

- **Hero:** approximately 45% copy / 55% image; 24–32px outer radius; image reaches the panel bottom. Use a transparent cutout asset when available. Highlight rectangles sit behind text, with enough padding to remain legible.
- **Product cards:** image ratio around 7:10, `object-fit: cover`, 12–16px radius. Text below the image; avoid boxing the entire card. Add to cart is a real button rather than an ambiguous arrow.
- **Buttons:** black fill, white label, small 4–8px radius, roughly 44–48px height. Hover/focus/pending states must remain visible. Secondary controls use a simple border or text treatment.
- **Decorations:** use lightweight CSS/SVG stars and swooshes, hidden from assistive technology. Keep them away from text and controls.
- **Footer:** compact black version of the reference with the shop name and useful navigation; include only real destinations.

## Other Screens — Suggested Adaptations

**Cart:** same header, white page, bold title. Product rows with thumbnail, name, NGN price, quantity control, and Remove. Use a right-hand order-summary panel on desktop and place it below the items on mobile. Primary action: Proceed to checkout. Empty state links back to Shop.

**Checkout:** two columns on desktop: item review and signed-in Google email at left; a light summary panel with quantities, total, and black Pay with Paystack button at right. On mobile, stack them. Do not add delivery, discount, or card-entry fields: the current scope has no shipping/discount logic and Paystack hosts payment collection.

**Login:** centred compact panel on white, shop wordmark, short explanation, and Continue with Google button. Match the typography and button spacing.

**Payment result:** centred status heading, reference, purchased items, total, and Back to shop. Clearly distinguish verified paid, still processing, and unsuccessful states. Show email pending separately from payment success. Avoid celebratory success visuals before backend verification.

## Responsive and Final Checks

Suggested breakpoints: below 640px use one product column; 640–1023px use two; 1024px and above use three. Keep the mobile header simple with Shop, Cart, and account controls; stack the hero text above its image. These are responsive recommendations, not supplied mobile designs.

Check 360px and 1440px widths: no horizontal overflow, readable headlines, balanced image crops, and visible keyboard focus. Use labelled inputs, meaningful image alt text, accessible icon buttons, and clear loading/error states. Compare desktop against the screenshots for colour, typography hierarchy, hero composition, image proportions, and whitespace. Do not claim pixel-perfect Figma matching from these raster references.