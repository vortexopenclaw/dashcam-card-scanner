import Foundation
@main struct PortableDiscoveryParity {
 static func main() throws {
  let base=URL(fileURLWithPath:CommandLine.arguments[1])
  let data=try Data(contentsOf:base.appendingPathComponent("tests/reference/discovery-validation-cases.json"))
  let cases=try JSONSerialization.jsonObject(with:data) as! [[String:Any]]
  for c in cases {
   let key=c["key"] as! String, value=c["value"] as! String, expected=c["valid"] as! Bool
   guard GenericCardDiscovery.safeValue(value,key:key)==expected else { fatalError("Swift portable mismatch: \(c)") }
  }
  let root=base.deletingLastPathComponent().resolvingSymlinksInPath().appendingPathComponent(UUID().uuidString)
  try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
  defer { try? FileManager.default.removeItem(at:root) }
  let corpus=try JSONSerialization.jsonObject(with:Data(contentsOf:base.appendingPathComponent("tests/reference/generic-discovery-synthetic.json"))) as! [String:Any]
  for f in corpus["files"] as! [[String:String]] {
   let target=root.appendingPathComponent(f["path"]!)
   try FileManager.default.createDirectory(at:target.deletingLastPathComponent(),withIntermediateDirectories:true)
   let text=f["text"]!
   var bytes=text.data(using: .utf8)!
   if f["encoding"]=="utf16le" { bytes=Data([255,254]);bytes.append(text.data(using:.utf16LittleEndian)!) }
   try bytes.write(to:target)
  }
  let result=GenericCardDiscovery.read(source:root)
  guard !result.observations.isEmpty else { fatalError("Native fixture retained no facts") }
  try JSONEncoder().encode(result).write(to:URL(fileURLWithPath:CommandLine.arguments[2]))
  print("PASS Swift native portable cases: \(cases.count); native fixture: \(result.observations.count) observations")
 }
}
