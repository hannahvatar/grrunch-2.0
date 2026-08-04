// Source of truth for the Privacy Policy modal (index.tsx) and, eventually,
// Settings > Legal. Mirrors termsOfUse.ts's shape -- see legalContent.ts.
import { bullets, LegalSection, text } from './legalContent';

export const PRIVACY_POLICY_EFFECTIVE_DATE = 'August 4, 2026';

export const PRIVACY_POLICY_INTRO =
  'Grrunch ("Grrunch," "we," "our," or "us") respects your privacy. This Privacy Policy explains what information we collect, how we use it, when we share it, and the choices you have regarding your information.\n\n' +
  'This Privacy Policy applies to the Grrunch mobile application, website, and related services (collectively, the "Service").\n\n' +
  'By using Grrunch, you agree to the practices described in this Privacy Policy.';

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    title: '1. Information We Collect',
    blocks: [
      text('Information You Provide'),
      text('When you use Grrunch, you may provide information including:'),
      bullets([
        'Your name',
        'Email address',
        'Authentication information (such as Sign in with Apple or Google)',
        'Grocery lists',
        'Saved recipes',
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
      text('Grrunch\nEmail: privacy@grrunch.com\nWebsite: www.grrunch.com'),
    ],
  },
];
