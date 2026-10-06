// Xcode 27 refuses to build any pod whose IPHONEOS_DEPLOYMENT_TARGET is
// below iOS 15 ("the range of supported deployment target versions is
// 15.0 to 27.0.x"). RevenueCat, Sentry, RNSVG and AsyncStorage still
// ship older targets, so raise every pod to at least MIN_TARGET in the
// Podfile's post_install. Lives in a config plugin because ios/ is
// generated and a hand edit there is lost on the next prebuild.
const { withPodfile } = require('expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

const MIN_TARGET = '15.1';

const withMinPodDeploymentTarget = (config) =>
  withPodfile(config, (cfg) => {
    cfg.modResults.contents = mergeContents({
      src: cfg.modResults.contents,
      tag: 'grrunch-min-pod-deployment-target',
      newSrc: [
        '    installer.pods_project.targets.each do |target|',
        '      target.build_configurations.each do |bc|',
        `        if bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${MIN_TARGET}`,
        `          bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_TARGET}'`,
        '        end',
        '      end',
        '    end',
      ].join('\n'),
      // Right after react_native_post_install(...)'s closing paren, so
      // nothing it sets afterwards can lower the target again.
      anchor: /:ccache_enabled => ccache_enabled\?/,
      offset: 2,
      comment: '#',
    }).contents;
    return cfg;
  });

module.exports = withMinPodDeploymentTarget;
