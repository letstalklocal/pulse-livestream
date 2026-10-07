Pod::Spec.new do |s|
  s.name = 'PulseAlphaPlayer'
  s.version = '0.1.0'
  s.summary = 'Isolated iOS AlphaPlayer gift preview for Pulse'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Pulse'
  s.homepage = 'https://github.com/bytedance/AlphaPlayer'
  s.platform = :ios, '17.0'
  s.source = { :git => 'https://github.com/bytedance/AlphaPlayer.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'BDAlphaPlayer', '= 1.2.2'
  s.frameworks = 'AVFoundation', 'Metal', 'MetalKit', 'UIKit'
  s.source_files = '**/*.{h,m,swift}'
  s.public_header_files = 'PPAlphaPlayerHost.h'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.swift_version = '5.9'
end
