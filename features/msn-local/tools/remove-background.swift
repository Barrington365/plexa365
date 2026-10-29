import Foundation
import Vision
import CoreImage
import ImageIO

// Local foreground segmentation. Preserve source colours; change only alpha.
do {
    guard CommandLine.arguments.count == 3 else { throw NSError(domain:"Cutout",code:1,userInfo:[NSLocalizedDescriptionKey:"Choose an input and output image"]) }
    let input = URL(fileURLWithPath:CommandLine.arguments[1])
    let output = URL(fileURLWithPath:CommandLine.arguments[2])
    let handler = VNImageRequestHandler(url:input,options:[:])
    let request = VNGenerateForegroundInstanceMaskRequest()
    try handler.perform([request])
    guard let result = request.results?.first, !result.allInstances.isEmpty else { throw NSError(domain:"Cutout",code:2,userInfo:[NSLocalizedDescriptionKey:"No foreground subject found. Try a clearer photograph."]) }
    let buffer = try result.generateMaskedImage(ofInstances:result.allInstances,from:handler,croppedToInstancesExtent:true)
    let image = CIImage(cvPixelBuffer:buffer)
    let context = CIContext()
    try context.writePNGRepresentation(of:image,to:output,format:.RGBA8,colorSpace:CGColorSpace(name:CGColorSpace.sRGB)!)
    print("Foreground cutout saved")
} catch { fputs("Background removal failed: \(error.localizedDescription)\n",stderr); exit(1) }
