/* ─────────────────────────────────────────────
 *  email.templates.ts
 *
 *  Production-grade HTML email templates.
 *  - Mobile-first, dark theme, brand gradient
 *  - 100% inline CSS — no external stylesheets
 *  - Gmail & Outlook compatible (table layout + VML)
 *  - Bulletproof VML CTA button for Outlook
 *  - Role-based dynamic content section
 * ───────────────────────────────────────────── */

/* ══════════════════════════════════════════
 *  BRAND TOKENS  (single source of truth)
 * ══════════════════════════════════════════ */
const B = {
    primary: '#6366f1',          // Indigo
    secondary: '#8b5cf6',          // Violet
    bg: '#0d0d0f',          // Near-black canvas
    surface: '#18181b',          // Card surface
    surfaceBorder: '#27272a',       // Card border
    textPrimary: '#f4f4f5',
    textSecondary: '#a1a1aa',
    textMuted: '#52525b',
    success: '#22c55e',
};

/* ══════════════════════════════════════════
 *  TYPES
 * ══════════════════════════════════════════ */

export interface WelcomeEmailParams {
    displayName: string;
    role: string;           // 'artist' | 'organizer' | …
    deepLinkUrl: string;    // CTA destination (deep link or web URL)
}

export interface RenderedEmail {
    subject: string;
    html: string;
    text: string;
}

/* ══════════════════════════════════════════
 *  ROLE-BASED COPY
 * ══════════════════════════════════════════ */

function getRoleContent(role: string): {
    badge: string;
    headline: string;
    body: string;
    ctaLabel: string;
    steps: Array<{ icon: string; title: string; desc: string }>;
} {
    if (role === 'organizer') {
        return {
            badge: '🎪 Organizer',
            headline: 'Start discovering talent today.',
            body: 'NETSA connects you with verified artists across India. Post your first gig and get applications from top talent in your city.',
            ctaLabel: 'Post Your First Gig',
            steps: [
                { icon: '📋', title: 'Complete your profile', desc: 'Add your organization and contact details' },
                { icon: '🎯', title: 'Post a gig', desc: 'Describe what you need and set your budget' },
                { icon: '🤝', title: 'Hire the perfect artist', desc: 'Review applications and confirm your booking' },
            ],
        };
    }
    return {
        badge: '🎤 Artist',
        headline: 'Get discovered by top organizers.',
        body: 'NETSA puts your profile in front of event organizers across India. Complete your profile to start receiving booking requests.',
        ctaLabel: 'Complete Your Profile',
        steps: [
            { icon: '🎨', title: 'Build your profile', desc: 'Showcase your skills, photos, and videos' },
            { icon: '🔍', title: 'Get discovered', desc: 'Organizers find you through smart search' },
            { icon: '💰', title: 'Book your next gig', desc: 'Accept bookings and grow your career' },
        ],
    };
}

/* ══════════════════════════════════════════
 *  PLAIN-TEXT FALLBACK
 * ══════════════════════════════════════════ */

function buildPlainText(p: WelcomeEmailParams, role: ReturnType<typeof getRoleContent>): string {
    return `
Welcome to NETSA, ${p.displayName}!

${role.headline}

${role.body}

${role.ctaLabel}: ${p.deepLinkUrl}

--- Next Steps ---
${role.steps.map((s, i) => `${i + 1}. ${s.title} — ${s.desc}`).join('\n')}

---
You received this because you registered on NETSA.
If you didn't create this account, you can safely ignore this email.

© ${new Date().getFullYear()} NETSA. All rights reserved.
`.trim();
}

/* ══════════════════════════════════════════
 *  HTML BUILDER  (table-based, inline CSS, VML)
 * ══════════════════════════════════════════ */

function buildHtml(p: WelcomeEmailParams, role: ReturnType<typeof getRoleContent>): string {
    const year = new Date().getFullYear();

    /* ── Bulletproof VML gradient button for Outlook ── */
    const ctaButton = `
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
  href="${p.deepLinkUrl}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="21%"
  fillcolor="${B.primary}" strokecolor="${B.primary}">
  <w:anchorlock/>
  <center style="color:#ffffff;font-family:-apple-system,Arial,sans-serif;font-size:15px;font-weight:700;">
    ${role.ctaLabel}&nbsp;→
  </center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="${p.deepLinkUrl}" target="_blank"
   style="background:linear-gradient(135deg,${B.primary} 0%,${B.secondary} 100%);border-radius:10px;color:#ffffff;display:inline-block;font-family:-apple-system,Arial,sans-serif;font-size:15px;font-weight:700;line-height:48px;text-align:center;text-decoration:none;padding:0 32px;mso-hide:all;">
  ${role.ctaLabel}&nbsp;→
</a>
<!--<![endif]-->`;

    /* ── Step rows ── */
    const stepsHtml = role.steps.map(s => `
<tr>
  <td style="padding:0 0 16px 0;">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation">
      <tr>
        <td width="44" valign="top" style="padding:0 14px 0 0;">
          <div style="
            width:44px;height:44px;border-radius:12px;
            background:${B.surface};border:1px solid ${B.surfaceBorder};
            text-align:center;line-height:44px;font-size:20px;
          ">${s.icon}</div>
        </td>
        <td valign="middle">
          <p style="margin:0 0 2px 0;font-family:-apple-system,Arial,sans-serif;font-size:14px;font-weight:700;color:${B.textPrimary};">${s.title}</p>
          <p style="margin:0;font-family:-apple-system,Arial,sans-serif;font-size:13px;color:${B.textSecondary};line-height:1.5;">${s.desc}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`).join('');

    return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="X-UA-Compatible" content="IE=edge"/>
  <meta name="x-apple-disable-message-reformatting"/>
  <title>Welcome to NETSA</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    /* ── Reset ── */
    body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;}
    img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none;}
    body{margin:0!important;padding:0!important;background-color:${B.bg};}
    /* ── Mobile overrides ── */
    @media only screen and (max-width:600px){
      .email-wrapper{width:100%!important;}
      .email-container{width:100%!important;max-width:100%!important;}
      .hero-pad{padding:32px 20px 28px!important;}
      .body-pad{padding:28px 20px!important;}
      .footer-pad{padding:20px!important;}
      .cta-wrap{text-align:center!important;}
      .cta-btn{display:block!important;text-align:center!important;}
      .hero-title{font-size:26px!important;line-height:34px!important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${B.bg};word-spacing:normal;">

<!-- ═══ PREVIEW TEXT (hidden) ═══ -->
<div style="display:none;font-size:1px;color:${B.bg};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
  Welcome to NETSA, ${p.displayName}! Your ${role.badge} account is ready. ${role.headline}
</div>

<!-- ═══ OUTER WRAPPER ═══ -->
<table class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
       style="background-color:${B.bg};margin:0 auto;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!-- ═══ EMAIL CONTAINER ═══ -->
      <table class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" role="presentation"
             style="max-width:600px;width:100%;border-radius:20px;overflow:hidden;border:1px solid ${B.surfaceBorder};">

        <!-- ── HERO BAND (gradient) ── -->
        <!--[if mso]>
        <tr><td style="background:${B.primary};border-radius:0;">
        <![endif]-->
        <!--[if !mso]><!-->
        <tr>
          <td class="hero-pad"
              style="background:linear-gradient(135deg,${B.primary} 0%,${B.secondary} 100%);
                     padding:44px 40px 36px;text-align:left;">
        <!--<![endif]-->

            <!-- Wordmark -->
            <table cellpadding="0" cellspacing="0" border="0" role="presentation">
              <tr>
                <td>
                  <p style="margin:0 0 24px 0;font-family:-apple-system,Arial,sans-serif;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                    ✦ NETSA
                  </p>
                </td>
              </tr>
            </table>

            <!-- Badge -->
            <table cellpadding="0" cellspacing="0" border="0" role="presentation">
              <tr>
                <td style="background:rgba(255,255,255,0.15);border-radius:20px;padding:5px 14px;margin-bottom:16px;display:inline-block;">
                  <p style="margin:0;font-family:-apple-system,Arial,sans-serif;font-size:12px;font-weight:600;color:#ffffff;letter-spacing:0.5px;">
                    ${role.badge}
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:10px 0 8px;width:100%;"></p>

            <!-- Headline -->
            <h1 class="hero-title"
                style="margin:0 0 12px 0;font-family:-apple-system,Arial,sans-serif;
                       font-size:30px;font-weight:800;color:#ffffff;
                       line-height:38px;letter-spacing:-0.5px;">
              Welcome,&nbsp;${p.displayName}!
            </h1>
            <p style="margin:0;font-family:-apple-system,Arial,sans-serif;
                      font-size:16px;color:rgba(255,255,255,0.80);line-height:1.6;">
              ${role.headline}
            </p>

          </td>
        </tr>

        <!-- ── BODY CARD ── -->
        <tr>
          <td class="body-pad"
              style="background:${B.surface};padding:36px 40px;">

            <!-- Role body copy -->
            <p style="margin:0 0 28px 0;font-family:-apple-system,Arial,sans-serif;
                      font-size:15px;color:${B.textSecondary};line-height:1.75;">
              ${role.body}
            </p>

            <!-- CTA button -->
            <table cellpadding="0" cellspacing="0" border="0" role="presentation" class="cta-wrap">
              <tr>
                <td class="cta-btn" align="left" style="padding:0 0 36px 0;">
                  ${ctaButton}
                </td>
              </tr>
            </table>

            <!-- Divider -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation">
              <tr>
                <td style="border-top:1px solid ${B.surfaceBorder};padding:0 0 28px 0;"></td>
              </tr>
            </table>

            <!-- Next steps heading -->
            <p style="margin:0 0 20px 0;font-family:-apple-system,Arial,sans-serif;
                      font-size:12px;font-weight:700;color:${B.textMuted};letter-spacing:1.5px;
                      text-transform:uppercase;">
              HOW TO GET STARTED
            </p>

            <!-- Steps -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation">
              ${stepsHtml}
            </table>

          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td class="footer-pad"
              style="background:${B.bg};border-top:1px solid ${B.surfaceBorder};
                     padding:24px 40px;text-align:center;">

            <p style="margin:0 0 8px 0;font-family:-apple-system,Arial,sans-serif;
                      font-size:12px;color:${B.textMuted};line-height:1.6;">
              You received this because you created a NETSA account.<br/>
              If this wasn't you, please ignore this email.
            </p>
            <p style="margin:0;font-family:-apple-system,Arial,sans-serif;
                      font-size:11px;color:${B.textMuted};">
              © ${year} NETSA &nbsp;·&nbsp;
              <a href="${p.deepLinkUrl}" style="color:${B.textMuted};text-decoration:underline;">Unsubscribe</a>
            </p>

          </td>
        </tr>

      </table>
      <!-- /email-container -->

    </td>
  </tr>
</table>
<!-- /wrapper -->

</body>
</html>`;
}

/* ══════════════════════════════════════════
 *  PUBLIC API
 * ══════════════════════════════════════════ */

/**
 * Render the welcome email template.
 *
 * @example
 * const { subject, html, text } = renderWelcomeEmail({
 *   displayName: 'Rohit',
 *   role: 'artist',
 *   deepLinkUrl: 'https://app.netsa.in/profile',
 * });
 */
export function renderWelcomeEmail(params: WelcomeEmailParams): RenderedEmail {
    const { displayName, role } = params;
    const roleContent = getRoleContent(role);

    return {
        subject: `Welcome to NETSA, ${displayName}! 🎉`,
        html: buildHtml(params, roleContent),
        text: buildPlainText(params, roleContent),
    };
}

/* ── Legacy shim (keeps email.worker.ts unchanged if it still calls welcomeEmailTemplate) ── */
/** @deprecated Use renderWelcomeEmail() instead */
export function welcomeEmailTemplate(p: { displayName: string; role: string }): RenderedEmail {
    return renderWelcomeEmail({
        ...p,
        deepLinkUrl: process.env.APP_URL ?? 'https://app.netsa.in',
    });
}

/* ══════════════════════════════════════════
 *  PASSWORD RESET EMAIL
 * ══════════════════════════════════════════ */

export interface PasswordResetEmailParams {
    displayName: string;
    code: string;
}

/**
 * Render the password-reset email template.
 *
 * @example
 * const { subject, html, text } = renderPasswordResetEmail({
 *   displayName: 'Rohit',
 *   code: '482917',
 * });
 */
export function renderPasswordResetEmail(params: PasswordResetEmailParams): RenderedEmail {
    const { displayName, code } = params;
    const year = new Date().getFullYear();

    const text = `
Hi ${displayName},

Your NETSA password reset code is: ${code}

This code expires in 10 minutes. If you didn't request a password reset, you can safely ignore this email.

© ${year} NETSA. All rights reserved.
`.trim();

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:${B.bg};font-family:-apple-system,Arial,sans-serif;">

<!-- Preview text -->
<div style="display:none;font-size:1px;color:${B.bg};max-height:0;overflow:hidden;">
  Your NETSA password reset code is ${code}
</div>

<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
       style="background-color:${B.bg};margin:0 auto;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table width="600" cellpadding="0" cellspacing="0" border="0" role="presentation"
             style="max-width:600px;width:100%;border-radius:20px;overflow:hidden;border:1px solid ${B.surfaceBorder};">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,${B.primary} 0%,${B.secondary} 100%);
                     padding:36px 40px;text-align:left;">
            <p style="margin:0 0 16px 0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
              ✦ NETSA
            </p>
            <h1 style="margin:0 0 8px 0;font-size:26px;font-weight:800;color:#ffffff;line-height:34px;">
              Reset Your Password
            </h1>
            <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.80);line-height:1.6;">
              Hi ${displayName}, use the code below to reset your password.
            </p>
          </td>
        </tr>

        <!-- Code -->
        <tr>
          <td style="background:${B.surface};padding:36px 40px;text-align:center;">
            <p style="margin:0 0 8px 0;font-size:12px;font-weight:700;color:${B.textMuted};
                      letter-spacing:1.5px;text-transform:uppercase;">
              YOUR RESET CODE
            </p>
            <p style="margin:0 0 24px 0;font-size:42px;font-weight:800;color:${B.textPrimary};
                      letter-spacing:12px;font-family:monospace,-apple-system,Arial,sans-serif;">
              ${code}
            </p>
            <p style="margin:0;font-size:14px;color:${B.textSecondary};line-height:1.6;">
              This code expires in <strong style="color:${B.textPrimary}">10 minutes</strong>.<br/>
              If you didn't request this, you can safely ignore this email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:${B.bg};border-top:1px solid ${B.surfaceBorder};
                     padding:24px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:${B.textMuted};">
              © ${year} NETSA · All rights reserved.
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;

    return {
        subject: `${code} is your NETSA password reset code`,
        html,
        text,
    };
}
