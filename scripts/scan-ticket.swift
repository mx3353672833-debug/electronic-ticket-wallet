import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

struct TextLine: Codable { let text: String; let confidence: Float; let x: CGFloat; let y: CGFloat; let width: CGFloat; let height: CGFloat }
struct ScanResult: Codable { let version: Int; let cropped: Bool; let confidence: Float; let corners: [[CGFloat]]; let rotation: Int; let width: Int; let height: Int; let lines: [TextLine]; let alternatives: [[TextLine]] }
let args = CommandLine.arguments
guard args.count == 3 else { fputs("usage: scan-ticket input-image output-directory\n", stderr); exit(2) }
let input = URL(fileURLWithPath: args[1]), out = URL(fileURLWithPath: args[2], isDirectory: true)
let context = CIContext(options: [.cacheIntermediates: false])
do {
  try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
  guard let original = CIImage(contentsOf: input, options: [.applyOrientationProperty: true]) else { throw NSError(domain: "scan", code: 1, userInfo: [NSLocalizedDescriptionKey:"无法打开照片"]) }
  let extent = original.extent
  let rectangles = VNDetectRectanglesRequest()
  rectangles.maximumObservations = 8
  rectangles.minimumAspectRatio = 0.3
  rectangles.maximumAspectRatio = 1
  rectangles.minimumSize = 0.25
  rectangles.minimumConfidence = 0.45
  rectangles.quadratureTolerance = 25
  try VNImageRequestHandler(ciImage: original).perform([rectangles])
  if (rectangles.results ?? []).isEmpty {
    rectangles.minimumConfidence = 0.25
    try VNImageRequestHandler(ciImage: original.applyingFilter("CIColorControls", parameters:[kCIInputContrastKey:1.6])).perform([rectangles])
  }
  let candidates = (rectangles.results ?? []).filter { $0.boundingBox.width * $0.boundingBox.height > 0.09 }
  let rectangle = candidates.max { a,b in a.boundingBox.width * a.boundingBox.height * CGFloat(a.confidence) < b.boundingBox.width * b.boundingBox.height * CGFloat(b.confidence) }
  var corrected = original
  var corners: [[CGFloat]] = []
  if let r = rectangle {
    let points = [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft]
    corners = points.map { [$0.x, 1 - $0.y] }
    // A slight outward margin preserves rounded corners and worn paper edges.
    let cx = points.map{$0.x}.reduce(0,+)/4, cy = points.map{$0.y}.reduce(0,+)/4
    let p = points.map { CGPoint(x: min(1,max(0,cx+($0.x-cx)*1.008))*extent.width, y: min(1,max(0,cy+($0.y-cy)*1.008))*extent.height) }
    corrected = original.applyingFilter("CIPerspectiveCorrection", parameters: ["inputTopLeft": CIVector(cgPoint:p[0]),"inputTopRight":CIVector(cgPoint:p[1]),"inputBottomRight":CIVector(cgPoint:p[2]),"inputBottomLeft":CIVector(cgPoint:p[3])])
  }
  var rotation = 0
  if corrected.extent.height > corrected.extent.width { corrected = corrected.oriented(.right); rotation = 90 }
  corrected = corrected.transformed(by: CGAffineTransform(translationX: -corrected.extent.minX, y: -corrected.extent.minY))
  let scale = min(1, 1800 / corrected.extent.width)
  corrected = corrected.applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: scale, kCIInputAspectRatioKey: 1])
  corrected = corrected.applyingFilter("CIColorControls", parameters:[kCIInputContrastKey:1.025]).applyingFilter("CIUnsharpMask", parameters:[kCIInputRadiusKey:0.7,kCIInputIntensityKey:0.18])
  func readText(_ img: CIImage) throws -> [TextLine] {
  guard let cg = context.createCGImage(img, from: img.extent.integral) else { return [] }
  let text = VNRecognizeTextRequest()
  text.recognitionLevel = .accurate
  text.recognitionLanguages = ["zh-Hans", "en-US"]
  text.usesLanguageCorrection = false
  text.minimumTextHeight = 0.012
  try VNImageRequestHandler(cgImage: cg).perform([text])
  return (text.results ?? []).compactMap { observation -> TextLine? in
    guard let candidate = observation.topCandidates(1).first else { return nil }
    let box = observation.boundingBox
    return TextLine(text: candidate.string, confidence: candidate.confidence, x: box.minX, y: 1-box.maxY, width: box.width, height: box.height)
  }
  }
  let enhanced = corrected.applyingFilter("CIColorControls", parameters:[kCIInputSaturationKey:0,kCIInputContrastKey:1.8,kCIInputBrightnessKey:-0.04])
  var alternatives = [try readText(corrected), try readText(enhanced)]
  if rotation != 0 {
    let upside = corrected.oriented(.down)
    let other = try readText(upside)
    let otherCount: Int = other.reduce(0) { $0 + $1.text.count }
    let firstCount: Int = alternatives[0].reduce(0) { $0 + $1.text.count }
    if otherCount > firstCount + 20 {
      corrected = upside; rotation = 270
      alternatives = [other, try readText(upside.applyingFilter("CIColorControls", parameters:[kCIInputSaturationKey:0,kCIInputContrastKey:1.8]))]
    }
  }
  let lines = alternatives[0]
  guard let cg = context.createCGImage(corrected, from: corrected.extent.integral) else { throw NSError(domain:"scan",code:2) }
  func writeJPEG(_ image: CGImage, _ name: String) throws {
    guard let dest = CGImageDestinationCreateWithURL(out.appendingPathComponent(name) as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { throw NSError(domain:"scan",code:3) }
    CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.94] as CFDictionary)
    guard CGImageDestinationFinalize(dest) else { throw NSError(domain:"scan",code:4) }
  }
  try writeJPEG(cg, "processed.jpg")
  let thumbScale = min(1, 480 / corrected.extent.width)
  let thumb = corrected.applyingFilter("CILanczosScaleTransform", parameters:[kCIInputScaleKey:thumbScale,kCIInputAspectRatioKey:1])
  if let small = context.createCGImage(thumb, from:thumb.extent.integral) { try writeJPEG(small,"thumbnail.jpg") }
  let result = ScanResult(version: 2, cropped: rectangle != nil, confidence: rectangle?.confidence ?? 0, corners: corners, rotation: rotation, width: cg.width, height: cg.height, lines: lines, alternatives: alternatives)
  let encoded = try JSONEncoder().encode(result)
  try encoded.write(to: out.appendingPathComponent("scan.json"), options: .atomic)
  print("OK \(cg.width)x\(cg.height) cropped=\(rectangle != nil) lines=\(lines.count)")
} catch { fputs("\(error.localizedDescription)\n", stderr); exit(1) }
