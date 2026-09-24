// Source of truth for the Privacy Policy modal (index.tsx) and, eventually,
// Settings > Legal. Mirrors termsOfUse.ts's shape -- see legalContent.ts.
import { bullets, LegalSection, text } from './legalContent';

// Bumped from September 15, 2026 for the Waitlist subsection in §1
// (Anabelle, 2026-09-24) -- a genuine content change, same as the
// earlier bump for the legal entity disclosure.
export const PRIVACY_POLICY_EFFECTIVE_DATE = 'September 24, 2026';

// Legal entity disclosure -- see termsOfUse.ts's own comment on this
// same addition (Anabelle, 2026-09-15). Named here in the intro (this
// is the document that actually needs to say who's responsible for
// your data) and again in Contact Us (§14 below).
export const PRIVACY_POLICY_INTRO =
  'Grrunch, owned and operated by 17216891 Canada Inc. ("Grrunch," "we," "our," or "us"), respects your privacy. This Privacy Policy explains what information we collect, how we use it, when we share it, and the choices you have regarding your information.\n\n' +
  'This Privacy Policy applies to the Grrunch mobile application and related services (collectively, the "Service").\n\n' +
  'By using Grrunch, you agree to the practices described in this Privacy Policy.';

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    title: '1. Information We Collect',
    blocks: [
      text('Information You Provide'),
      text('When you use Grrunch, you may provide information including:'),
      // "Saved recipes" dropped (Anabelle, 2026-09-15: Save/Favourite was
      // shelved for v1 scope, PR #222 -- "make sure its not stated
      // anywhere in the copy") -- this list should only name what
      // Grrunch actually collects today, not a shelved feature.
      bullets([
        'Your name',
        'Email address',
        'Authentication information (such as Sign in with Apple or Google)',
        'Grocery lists',
        'Favourite stores',
        'Shopping preferences',
        'Feedback or support requests',
        'Any other information you choose to provide',
      ]),
      text('We do not receive your passwords for third-party sign-in providers.'),
      text('Information Collected Automatically'),
      text('When you use Grrunch, we may automatically collect information such as:'),
      bullets([
        'Device type',
        'Operating system',
        'App version',
        'Language',
        'General location (if permission is granted)',
        'Crash reports',
        'Performance information',
        'Feature usage',
        'Interaction with recipes, grocery lists, and deals',
      ]),
      text('We collect only the information reasonably necessary to operate, improve, and secure Grrunch.'),
      text('Location Information'),
      text('If you choose to allow location access, Grrunch may use your location to:'),
      bullets(['show nearby grocery stores;', 'provide region-specific flyer deals;', 'improve shopping recommendations.']),
      text('You may disable location permissions at any time through your device settings.'),
      // Waitlist sign-ups (Anabelle, 2026-09-24) -- people outside BC can
      // leave an email without an account (components/OutsideAreaModal.tsx,
      // public.waitlist). Covers marketing use too, matching the consent
      // line shown in that modal (CASL requires it at sign-up).
      text('Waitlist'),
      text(
        'If you are outside our current service area (British Columbia), you can choose to join our waitlist without creating an account. When you do, we collect:'
      ),
      bullets([
        'your email address;',
        'your approximate location (rounded to about 10 km), if you allowed location access.',
      ]),
      text(
        'We use this to let you know when Grrunch becomes available in your area, to send you news and offers about Grrunch, and to understand where demand is coming from. We don’t sell it or share it with third parties for their own marketing.'
      ),
      text('You can unsubscribe at any time using the link in any email we send, or by writing to privacy@grrunch.com.'),
    ],
  },
  {
    title: '2. How We Use Your Information',
    blocks: [
      text('We use your information to:'),
      bullets([
        'create and manage your account;',
        'synchronize your grocery lists across devices;',
        'display relevant grocery flyers and deals;',
        'recommend affordable recipes;',
        'personalize your experience;',
        'improve search and recommendations;',
        'detect fraud and abuse;',
        'provide customer support;',
        'improve the reliability and performance of Grrunch;',
        'develop new products and features.',
      ]),
    ],
  },
  {
    title: '3. Grocery Intelligence and Analytics',
    blocks: [
      text(
        "One of Grrunch's goals is to better understand grocery shopping patterns, food affordability, pricing trends, and recipe usage."
      ),
      text('To achieve this, we may analyze information generated through the Service to create:'),
      bullets([
        'statistical reports;',
        'shopping trend analysis;',
        'grocery market insights;',
        'recipe popularity reports;',
        'product usage analytics;',
        'operational metrics.',
      ]),
      text(
        'Whenever practical, these insights are produced using aggregated and anonymized information that does not identify individual users.'
      ),
      text('Examples include:'),
      bullets([
        'average grocery savings;',
        'popular ingredients;',
        'regional shopping trends;',
        'seasonal purchasing patterns;',
        'recipe engagement statistics.',
      ]),
      text('We do not use aggregated analytics to identify individual users.'),
    ],
  },
  {
    title: '4. Artificial Intelligence',
    blocks: [
      text('Some Grrunch features may use artificial intelligence to:'),
      bullets([
        'recommend recipes;',
        'suggest grocery substitutions;',
        'organize grocery lists;',
        'improve search;',
        'personalize recommendations;',
        'assist with future shopping experiences.',
      ]),
      text(
        'AI-generated suggestions are intended to assist users and should not be considered professional nutritional or medical advice.'
      ),
    ],
  },
  {
    title: '5. Sharing Information',
    blocks: [
      text('We may share information with trusted service providers that help us operate Grrunch, including providers for:'),
      bullets([
        'cloud hosting;',
        'authentication;',
        'database services;',
        'customer support;',
        'infrastructure monitoring;',
        'analytics;',
        'email delivery.',
      ]),
      text(
        'These providers may process information only on our behalf and only for the purposes described in this Privacy Policy.'
      ),
      text('Business Transfers'),
      text(
        'If Grrunch is involved in a merger, acquisition, financing, or sale of assets, user information may be transferred as part of that transaction, subject to applicable privacy laws.'
      ),
      text('Legal Requirements'),
      text('We may disclose information when required to:'),
      bullets([
        'comply with applicable law;',
        'respond to lawful requests from public authorities;',
        'protect our legal rights;',
        'investigate fraud or abuse;',
        'protect the safety of users or others.',
      ]),
    ],
  },
  {
    title: '6. What We Do Not Sell',
    blocks: [
      text('We do not sell your personally identifiable information to data brokers.'),
      text('We do not provide advertisers with information that directly identifies you for cross-app advertising purposes.'),
      text(
        'If our practices change in the future, we will update this Privacy Policy and, where required, obtain any necessary consent.'
      ),
    ],
  },
  {
    title: '7. Third-Party Services',
    blocks: [
      text('Grrunch may integrate with third-party services, including authentication providers such as Apple and Google.'),
      text('Those services operate under their own privacy policies.'),
      text('We encourage you to review them before using those services.'),
    ],
  },
  {
    title: '8. Data Security',
    blocks: [
      text('We use reasonable administrative, technical, and organizational safeguards to protect your information.'),
      text(
        'However, no method of electronic transmission or storage is completely secure, and we cannot guarantee absolute security.'
      ),
    ],
  },
  {
    title: '9. Data Retention',
    blocks: [
      text('We retain information only as long as reasonably necessary to:'),
      bullets([
        'provide the Service;',
        'comply with legal obligations;',
        'resolve disputes;',
        'enforce our agreements;',
        'improve our products.',
      ]),
      text('When information is no longer required, we will securely delete or anonymize it where appropriate.'),
    ],
  },
  {
    title: '10. Your Choices',
    blocks: [
      text('You may:'),
      bullets([
        'update your account information;',
        'change notification settings;',
        'revoke location permission;',
        'request deletion of your account;',
        'request access to your personal information, where applicable under Canadian law.',
      ]),
      text('Some information may need to be retained for legal, accounting, or security purposes.'),
    ],
  },
  {
    title: "11. Children's Privacy",
    blocks: [
      text(
        'Grrunch is not intended for children under the minimum legal age required to use the Service without parental consent.'
      ),
      text(
        'If we become aware that personal information has been collected from a child contrary to applicable law, we will take reasonable steps to delete it.'
      ),
    ],
  },
  {
    title: '12. International Processing',
    blocks: [
      text('Your information may be processed or stored in countries other than Canada where our service providers operate.'),
      text('When this occurs, we take reasonable steps to ensure your information receives an appropriate level of protection.'),
    ],
  },
  {
    title: '13. Changes to This Privacy Policy',
    blocks: [
      text('We may update this Privacy Policy from time to time.'),
      text('When material changes are made, we will notify users through the Service or by other reasonable means.'),
      text('The updated version becomes effective on the published Effective Date.'),
    ],
  },
  {
    title: '14. Contact Us',
    blocks: [
      text('If you have questions about this Privacy Policy or wish to exercise your privacy rights, please contact us:'),
      text('Grrunch, owned and operated by 17216891 Canada Inc.\nEmail: privacy@grrunch.com'),
    ],
  },
];
