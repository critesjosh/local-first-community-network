require "json"

package = JSON.parse(File.read(File.join(__dir__, "..", "package.json")))

Pod::Spec.new do |s|
  s.name         = "RNLCBluetooth"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/localcommunity/network"
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "12.0" }
  s.source       = { :git => "https://github.com/facebook/react-native.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.requires_arc = true

  s.dependency "React-Core"
  s.dependency "React-CoreModules"
  s.dependency "React-RCTBlob"
  s.dependency "React-Core/RCTWebSocket"
end
