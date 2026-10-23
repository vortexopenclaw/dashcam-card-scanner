import Foundation
import CoreGraphics
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let data = try JSONSerialization.data(withJSONObject: list, options: [.prettyPrinted, .sortedKeys])
try data.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
print(String(data: data, encoding: .utf8)!)
